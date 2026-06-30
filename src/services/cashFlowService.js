const { Op, fn, col, literal } = require('sequelize');
const {
  sequelize, CashFlowStatement, CashFlowLine, User,
  Invoice, InvoicePayment, Bill, BillPayment, Payroll, Claim, Employee, Project
} = require('../models');

/**
 * Cash Flow Service — monthly cash-flow forecast / solvency test.
 *
 * A statement is a grid: rows = inflow/outflow line items, columns = months.
 * Projected figures live in CashFlowLine.amounts (JSONB array, length num_months).
 * Computed rows (SUM inflows/outflows, net, opening/closing balance, row totals)
 * are derived here and never stored. "Pull actuals" fills CashFlowLine.actuals
 * from real Invoice/Bill/Payroll/Claim cash movements (cash basis, by payment date).
 */

// Default line items mirroring the Averroes solvency-test layout. Used to seed a
// new statement when seed_template is requested; all are editable afterwards.
const DEFAULT_TEMPLATE = {
  inflow: [
    { label: 'Income from Projects', source: 'invoice' },
    { label: 'Others', source: 'manual' },
    { label: 'Director Paid Up Capital', source: 'manual' },
    { label: 'Advance from (Other debtors)', source: 'manual' }
  ],
  outflow: [
    { label: 'Advance to (Other debtors)', source: 'manual' },
    { label: 'Staff Salary, EPF, SOCSO & EIS, Insurance', source: 'payroll' },
    { label: 'Levy HRD Corp', source: 'manual' },
    { label: 'Office Rental', source: 'manual' },
    { label: 'Company Domain & Microsoft Subscription', source: 'manual' },
    { label: 'External Consultancy Services', source: 'manual' },
    { label: 'Out of Pocket Expenses (OPE)', source: 'claim' },
    { label: 'Zakat MAIWP', source: 'manual' },
    { label: 'Dividend', source: 'manual' },
    { label: 'Income tax paid', source: 'manual' }
  ]
};

// ── helpers ──────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Coerce an amounts array to exactly `n` numeric entries.
const normalizeAmounts = (arr, n) => {
  const out = new Array(n).fill(0);
  if (Array.isArray(arr)) {
    for (let i = 0; i < n; i++) out[i] = round2(arr[i]);
  }
  return out;
};

// Build the ordered list of calendar months for the projection columns.
// Returns [{ index, year, month (1-12), label e.g. 'May-24' }]
const buildMonths = (startMonth, numMonths) => {
  const start = new Date(startMonth);
  const baseYear = start.getUTCFullYear();
  const baseMonth = start.getUTCMonth(); // 0-11
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const cols = [];
  for (let i = 0; i < numMonths; i++) {
    const m = baseMonth + i;
    const year = baseYear + Math.floor(m / 12);
    const month = (m % 12); // 0-11
    cols.push({
      index: i,
      year,
      month: month + 1,
      label: `${MONTHS[month]}-${String(year).slice(-2)}`
    });
  }
  return cols;
};

/**
 * Compute all derived figures for a statement + its lines.
 * Returns a plain object ready to send to the client.
 */
const computeTotals = (statement, lines) => {
  const n = statement.num_months;
  const months = buildMonths(statement.start_month, n);

  const inflowLines = [];
  const outflowLines = [];

  for (const line of lines) {
    const amounts = normalizeAmounts(line.amounts, n);
    const actuals = line.actuals ? normalizeAmounts(line.actuals, n) : null;
    const row = {
      id: line.id,
      public_id: line.public_id,
      section: line.section,
      label: line.label,
      sort_order: line.sort_order,
      source: line.source,
      source_ref: line.source_ref,
      amounts,
      actuals,
      total: round2(amounts.reduce((s, v) => s + v, 0))
    };
    (line.section === 'inflow' ? inflowLines : outflowLines).push(row);
  }

  inflowLines.sort((a, b) => a.sort_order - b.sort_order);
  outflowLines.sort((a, b) => a.sort_order - b.sort_order);

  const sumByMonth = (rows) => {
    const arr = new Array(n).fill(0);
    for (const r of rows) for (let i = 0; i < n; i++) arr[i] = round2(arr[i] + r.amounts[i]);
    return arr;
  };

  const inflowTotals = sumByMonth(inflowLines);
  const outflowTotals = sumByMonth(outflowLines);

  const net = new Array(n).fill(0);
  const opening = new Array(n).fill(0);
  const closing = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    net[i] = round2(inflowTotals[i] - outflowTotals[i]);
    opening[i] = i === 0 ? round2(Number(statement.opening_balance)) : closing[i - 1];
    closing[i] = round2(opening[i] + net[i]);
  }

  const grand = (arr) => round2(arr.reduce((s, v) => s + v, 0));

  return {
    months,
    inflow_lines: inflowLines,
    outflow_lines: outflowLines,
    totals: {
      inflows: { by_month: inflowTotals, total: grand(inflowTotals) },
      outflows: { by_month: outflowTotals, total: grand(outflowTotals) },
      net: { by_month: net, total: grand(net) },
      opening: { by_month: opening },
      closing: { by_month: closing, final: closing[n - 1] ?? round2(Number(statement.opening_balance)) }
    }
  };
};

// ── statement CRUD ────────────────────────────────────────────────────────────

const listStatements = async (companyId) => {
  const statements = await CashFlowStatement.findAll({
    where: { company_id: companyId },
    include: [
      { model: User, as: 'creator', attributes: ['id', 'email'] },
      { model: CashFlowLine, as: 'lines', attributes: ['id', 'section', 'amounts'] }
    ],
    order: [['start_month', 'DESC'], ['created_at', 'DESC']]
  });

  return statements.map((s) => {
    const computed = computeTotals(s, s.lines || []);
    return {
      id: s.id,
      public_id: s.public_id,
      title: s.title,
      start_month: s.start_month,
      num_months: s.num_months,
      opening_balance: Number(s.opening_balance),
      currency: s.currency,
      status: s.status,
      created_at: s.created_at,
      creator: s.creator ? { id: s.creator.id, email: s.creator.email } : null,
      // light summary for the list cards
      summary: {
        total_inflows: computed.totals.inflows.total,
        total_outflows: computed.totals.outflows.total,
        net: computed.totals.net.total,
        closing_balance: computed.totals.closing.final
      }
    };
  });
};

const findStatement = async (companyId, publicId) => {
  return CashFlowStatement.findOne({
    where: { public_id: publicId, company_id: companyId },
    include: [
      { model: CashFlowLine, as: 'lines' },
      { model: User, as: 'creator', attributes: ['id', 'email'] }
    ]
  });
};

const serializeStatement = (statement) => {
  const computed = computeTotals(statement, statement.lines || []);
  return {
    id: statement.id,
    public_id: statement.public_id,
    title: statement.title,
    start_month: statement.start_month,
    num_months: statement.num_months,
    opening_balance: Number(statement.opening_balance),
    currency: statement.currency,
    status: statement.status,
    notes: statement.notes,
    created_at: statement.created_at,
    updated_at: statement.updated_at,
    creator: statement.creator ? { id: statement.creator.id, email: statement.creator.email } : null,
    ...computed
  };
};

const getStatement = async (companyId, publicId) => {
  const statement = await findStatement(companyId, publicId);
  if (!statement) return null;
  return serializeStatement(statement);
};

const createStatement = async (companyId, userId, data) => {
  const numMonths = Math.min(Math.max(parseInt(data.num_months, 10) || 12, 1), 36);
  const statement = await CashFlowStatement.create({
    company_id: companyId,
    created_by: userId,
    title: data.title || 'Cash Flow Forecast',
    start_month: data.start_month,
    num_months: numMonths,
    opening_balance: round2(data.opening_balance),
    currency: data.currency || 'MYR',
    status: data.status === 'Final' ? 'Final' : 'Draft',
    notes: data.notes || null
  });

  if (data.seed_template) {
    const rows = [];
    let order = 0;
    for (const section of ['inflow', 'outflow']) {
      for (const tpl of DEFAULT_TEMPLATE[section]) {
        rows.push({
          statement_id: statement.id,
          section,
          label: tpl.label,
          source: tpl.source,
          sort_order: order++,
          amounts: new Array(numMonths).fill(0),
          actuals: null
        });
      }
    }
    await CashFlowLine.bulkCreate(rows);
  }

  return getStatement(companyId, statement.public_id);
};

const updateStatement = async (companyId, publicId, data) => {
  const statement = await CashFlowStatement.findOne({ where: { public_id: publicId, company_id: companyId } });
  if (!statement) return null;

  const patch = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.start_month !== undefined) patch.start_month = data.start_month;
  if (data.opening_balance !== undefined) patch.opening_balance = round2(data.opening_balance);
  if (data.currency !== undefined) patch.currency = data.currency;
  if (data.status !== undefined) patch.status = data.status === 'Final' ? 'Final' : 'Draft';
  if (data.notes !== undefined) patch.notes = data.notes;

  // Changing num_months resizes every line's amounts/actuals arrays.
  let newNum = null;
  if (data.num_months !== undefined) {
    newNum = Math.min(Math.max(parseInt(data.num_months, 10) || statement.num_months, 1), 36);
    patch.num_months = newNum;
  }

  await statement.update(patch);

  if (newNum !== null && newNum !== statement.num_months) {
    const lines = await CashFlowLine.findAll({ where: { statement_id: statement.id } });
    await Promise.all(lines.map((line) => line.update({
      amounts: normalizeAmounts(line.amounts, newNum),
      actuals: line.actuals ? normalizeAmounts(line.actuals, newNum) : null
    })));
  }

  return getStatement(companyId, publicId);
};

const deleteStatement = async (companyId, publicId) => {
  const statement = await CashFlowStatement.findOne({ where: { public_id: publicId, company_id: companyId } });
  if (!statement) return false;
  await CashFlowLine.destroy({ where: { statement_id: statement.id } });
  await statement.destroy();
  return true;
};

// ── line operations ───────────────────────────────────────────────────────────

// Bulk replace all lines for a statement (the grid "Save" action).
// `lines` = [{ public_id?, section, label, source?, source_ref?, amounts[], sort_order? }]
const saveLines = async (companyId, publicId, lines) => {
  const statement = await CashFlowStatement.findOne({ where: { public_id: publicId, company_id: companyId } });
  if (!statement) return null;
  const n = statement.num_months;

  await sequelize.transaction(async (t) => {
    const existing = await CashFlowLine.findAll({ where: { statement_id: statement.id }, transaction: t });
    const existingById = new Map(existing.map((l) => [l.public_id, l]));
    const keptIds = new Set();

    let order = 0;
    for (const incoming of lines) {
      const section = incoming.section === 'outflow' ? 'outflow' : 'inflow';
      const payload = {
        section,
        label: (incoming.label || '').toString().slice(0, 255) || 'Untitled',
        source: ['invoice', 'bill', 'payroll', 'claim'].includes(incoming.source) ? incoming.source : 'manual',
        source_ref: incoming.source_ref || null,
        sort_order: incoming.sort_order ?? order++,
        amounts: normalizeAmounts(incoming.amounts, n)
      };

      // Persist actuals when the client sends them (supports manual actual entry,
      // e.g. a cash movement not tracked in any module). Only `actuals` present
      // as a key is honoured; otherwise existing actuals are preserved so a
      // projected-only save never wipes pulled figures.
      if ('actuals' in incoming) {
        payload.actuals = Array.isArray(incoming.actuals) ? normalizeAmounts(incoming.actuals, n) : null;
      }

      const match = incoming.public_id && existingById.get(incoming.public_id);
      if (match) {
        await match.update(payload, { transaction: t });
        keptIds.add(match.public_id);
      } else {
        const created = await CashFlowLine.create({ ...payload, statement_id: statement.id }, { transaction: t });
        keptIds.add(created.public_id);
      }
    }

    // Delete lines that were removed in the client.
    const toDelete = existing.filter((l) => !keptIds.has(l.public_id)).map((l) => l.id);
    if (toDelete.length) await CashFlowLine.destroy({ where: { id: toDelete }, transaction: t });
  });

  return getStatement(companyId, publicId);
};

// ── pull actuals (cash basis) ──────────────────────────────────────────────────

// Map a calendar (year, month 1-12) to its column index, or -1 if outside range.
const monthIndexLookup = (months) => {
  const map = new Map();
  months.forEach((m) => map.set(`${m.year}-${m.month}`, m.index));
  return (year, month) => {
    const i = map.get(`${year}-${month}`);
    return i === undefined ? -1 : i;
  };
};

const resolveProjectId = async (companyId, sourceRef) => {
  if (!sourceRef) return null;
  const project = await Project.findOne({ where: { public_id: sourceRef, company_id: companyId } });
  return project ? project.id : null;
};

const pullInvoiceActuals = async (companyId, months, lookup, sourceRef, n) => {
  const projectId = await resolveProjectId(companyId, sourceRef);
  const start = `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01`;
  const payments = await InvoicePayment.findAll({
    where: { payment_date: { [Op.gte]: start } },
    include: [{
      model: Invoice, as: 'invoice', required: true,
      where: { company_id: companyId, ...(projectId ? { project_id: projectId } : {}) },
      attributes: []
    }],
    attributes: ['payment_date', 'amount'],
    raw: true
  });
  const arr = new Array(n).fill(0);
  for (const p of payments) {
    const d = new Date(p.payment_date);
    const idx = lookup(d.getUTCFullYear(), d.getUTCMonth() + 1);
    if (idx >= 0) arr[idx] = round2(arr[idx] + Number(p.amount));
  }
  return arr;
};

const pullBillActuals = async (companyId, months, lookup, sourceRef, n) => {
  const projectId = await resolveProjectId(companyId, sourceRef);
  const start = `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01`;
  const payments = await BillPayment.findAll({
    where: { payment_date: { [Op.gte]: start } },
    include: [{
      model: Bill, as: 'bill', required: true,
      where: { company_id: companyId, ...(projectId ? { project_id: projectId } : {}) },
      attributes: []
    }],
    attributes: ['payment_date', 'amount'],
    raw: true
  });
  const arr = new Array(n).fill(0);
  for (const p of payments) {
    const d = new Date(p.payment_date);
    const idx = lookup(d.getUTCFullYear(), d.getUTCMonth() + 1);
    if (idx >= 0) arr[idx] = round2(arr[idx] + Number(p.amount));
  }
  return arr;
};

const pullPayrollActuals = async (companyId, months, lookup, n) => {
  const rows = await Payroll.findAll({
    where: { status: 'Paid' },
    include: [{ model: Employee, as: 'employee', where: { company_id: companyId }, attributes: [], required: true }],
    attributes: ['year', 'month', 'net_salary'],
    raw: true
  });
  const arr = new Array(n).fill(0);
  for (const r of rows) {
    const idx = lookup(parseInt(r.year, 10), parseInt(r.month, 10));
    if (idx >= 0) arr[idx] = round2(arr[idx] + Number(r.net_salary));
  }
  return arr;
};

const pullClaimActuals = async (companyId, months, lookup, sourceRef, n) => {
  const projectId = await resolveProjectId(companyId, sourceRef);
  const start = `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01`;
  const rows = await Claim.findAll({
    where: { status: 'Paid', date: { [Op.gte]: start }, ...(projectId ? { project_id: projectId } : {}) },
    include: [{ model: Employee, as: 'employee', where: { company_id: companyId }, attributes: [], required: true }],
    attributes: ['date', 'amount'],
    raw: true
  });
  const arr = new Array(n).fill(0);
  for (const r of rows) {
    const d = new Date(r.date);
    const idx = lookup(d.getUTCFullYear(), d.getUTCMonth() + 1);
    if (idx >= 0) arr[idx] = round2(arr[idx] + Number(r.amount));
  }
  return arr;
};

// Refresh CashFlowLine.actuals for every non-manual line in the statement.
const pullActuals = async (companyId, publicId) => {
  const statement = await findStatement(companyId, publicId);
  if (!statement) return null;
  const n = statement.num_months;
  const months = buildMonths(statement.start_month, n);
  const lookup = monthIndexLookup(months);

  const lines = statement.lines || [];
  await Promise.all(lines.map(async (line) => {
    let actuals = null;
    switch (line.source) {
      case 'invoice': actuals = await pullInvoiceActuals(companyId, months, lookup, line.source_ref, n); break;
      case 'bill': actuals = await pullBillActuals(companyId, months, lookup, line.source_ref, n); break;
      case 'payroll': actuals = await pullPayrollActuals(companyId, months, lookup, n); break;
      case 'claim': actuals = await pullClaimActuals(companyId, months, lookup, line.source_ref, n); break;
      default: return; // manual lines untouched
    }
    await line.update({ actuals });
  }));

  return getStatement(companyId, publicId);
};

// ── print model (for PDF export) ───────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Flatten a serialized statement into a layout-agnostic structure the PDF
// renderer can walk row by row. `view` selects projected amounts or actuals.
const buildPrintModel = (statement, companyName, view = 'projected') => {
  const n = statement.num_months;
  const months = statement.months || buildMonths(statement.start_month, n);
  const pick = (line) => {
    const src = view === 'actual' ? (line.actuals || []) : (line.amounts || []);
    return Array.from({ length: n }, (_, i) => round2(src[i] ?? 0));
  };

  const sectionModel = (lines) => {
    const rendered = (lines || []).map((l) => {
      const values = pick(l);
      return { label: l.label || 'Untitled', values, total: round2(values.reduce((s, v) => s + v, 0)) };
    });
    const sumValues = new Array(n).fill(0);
    for (const r of rendered) for (let i = 0; i < n; i++) sumValues[i] = round2(sumValues[i] + r.values[i]);
    return { lines: rendered, sumValues, sumTotal: round2(sumValues.reduce((s, v) => s + v, 0)) };
  };

  const inflow = sectionModel(statement.inflow_lines);
  const outflow = sectionModel(statement.outflow_lines);

  const net = new Array(n).fill(0);
  const opening = new Array(n).fill(0);
  const closing = new Array(n).fill(0);
  const ob = round2(Number(statement.opening_balance) || 0);
  for (let i = 0; i < n; i++) {
    net[i] = round2(inflow.sumValues[i] - outflow.sumValues[i]);
    opening[i] = i === 0 ? ob : closing[i - 1];
    closing[i] = round2(opening[i] + net[i]);
  }

  const first = months[0];
  const last = months[n - 1];
  const periodLabel = first && last
    ? `${MONTH_NAMES[first.month - 1]} ${first.year} TO ${MONTH_NAMES[last.month - 1]} ${last.year}`
    : '';

  return {
    meta: {
      companyName: (companyName || '').toUpperCase(),
      title: statement.title,
      subtitle: `SOLVENCY TEST FOR ${n} MONTH${n === 1 ? '' : 'S'} ( FROM ${periodLabel} )`,
      currency: statement.currency || 'MYR',
      view: view === 'actual' ? 'Actual' : 'Projected',
      status: statement.status
    },
    months: months.map((m) => m.label),
    inflow,
    outflow,
    net: { values: net, total: round2(net.reduce((s, v) => s + v, 0)) },
    opening: { values: opening },
    closing: { values: closing, final: closing[n - 1] ?? ob }
  };
};

module.exports = {
  DEFAULT_TEMPLATE,
  buildMonths,
  computeTotals,
  buildPrintModel,
  findStatement,
  listStatements,
  getStatement,
  createStatement,
  updateStatement,
  deleteStatement,
  saveLines,
  pullActuals
};
