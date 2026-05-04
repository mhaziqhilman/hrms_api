const { Op, fn, col, literal } = require('sequelize');
const { sequelize, Invoice, Bill, Claim, Project, Payroll, Employee } = require('../models');

/**
 * Finance Service — computes P&L from existing transactional data.
 * No double-entry GL; everything derived from Invoice + Bill + Claim + Payroll.
 *
 * Definitions:
 *  - REALIZED  = paid invoices (revenue received) − paid bills (cash expenses) − paid claims − paid payroll
 *  - UNREALIZED = open invoices (issued, not yet paid) − open bills (approved, not yet paid)
 */

const buildDateFilter = (field, from, to) => {
  if (!from && !to) return {};
  const f = {};
  if (from) f[Op.gte] = from;
  if (to) f[Op.lte] = to;
  return { [field]: f };
};

const sumInvoices = async (companyId, projectId, from, to) => {
  const where = {
    company_id: companyId,
    status: { [Op.notIn]: ['Cancelled'] },
    ...buildDateFilter('invoice_date', from, to)
  };
  if (projectId) where.project_id = projectId;

  const result = await Invoice.findOne({
    where,
    attributes: [
      [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'invoiced'],
      [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'received'],
      [fn('COALESCE', fn('SUM', col('balance_due')), 0), 'receivable'],
      [fn('COUNT', col('id')), 'count']
    ],
    raw: true
  });
  return {
    invoiced: parseFloat(result.invoiced || 0),
    received: parseFloat(result.received || 0),
    receivable: parseFloat(result.receivable || 0),
    count: parseInt(result.count || 0, 10)
  };
};

const sumBills = async (companyId, projectId, from, to) => {
  const where = {
    company_id: companyId,
    status: { [Op.ne]: 'Cancelled' },
    ...buildDateFilter('bill_date', from, to)
  };
  if (projectId) where.project_id = projectId;

  const result = await Bill.findOne({
    where,
    attributes: [
      [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'billed'],
      [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'paid'],
      [fn('COALESCE', fn('SUM', col('balance_due')), 0), 'payable'],
      [fn('COUNT', col('id')), 'count']
    ],
    raw: true
  });
  return {
    billed: parseFloat(result.billed || 0),
    paid: parseFloat(result.paid || 0),
    payable: parseFloat(result.payable || 0),
    count: parseInt(result.count || 0, 10)
  };
};

const sumClaims = async (companyId, projectId, from, to) => {
  const where = {
    status: { [Op.in]: ['Finance_Approved', 'Paid'] },
    ...buildDateFilter('date', from, to)
  };
  if (projectId) where.project_id = projectId;

  const result = await Claim.findOne({
    where,
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: [],
      required: true
    }],
    attributes: [
      [fn('COALESCE', fn('SUM', col('Claim.amount')), 0), 'amount'],
      [fn('SUM', literal(`CASE WHEN "Claim"."status" = 'Paid' THEN "Claim"."amount" ELSE 0 END`)), 'paid_amount'],
      [fn('COUNT', col('Claim.id')), 'count']
    ],
    raw: true
  });
  return {
    approved: parseFloat(result.amount || 0),
    paid: parseFloat(result.paid_amount || 0),
    count: parseInt(result.count || 0, 10)
  };
};

const sumPayroll = async (companyId, from, to) => {
  // Payroll uses year/month not date, so we map (from,to) onto the year+month tuples
  const where = { status: { [Op.in]: ['Approved', 'Paid'] } };
  if (from) {
    const fromDate = new Date(from);
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(literal(
      `(("Payroll"."year" > ${fromDate.getFullYear()}) OR ("Payroll"."year" = ${fromDate.getFullYear()} AND "Payroll"."month" >= ${fromDate.getMonth() + 1}))`
    ));
  }
  if (to) {
    const toDate = new Date(to);
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(literal(
      `(("Payroll"."year" < ${toDate.getFullYear()}) OR ("Payroll"."year" = ${toDate.getFullYear()} AND "Payroll"."month" <= ${toDate.getMonth() + 1}))`
    ));
  }

  const result = await Payroll.findOne({
    where,
    include: [{
      model: Employee,
      as: 'employee',
      where: { company_id: companyId },
      attributes: [],
      required: true
    }],
    attributes: [
      [fn('COALESCE', fn('SUM', col('gross_salary')), 0), 'gross'],
      [fn('SUM', literal(`CASE WHEN "Payroll"."status" = 'Paid' THEN "Payroll"."net_salary" ELSE 0 END`)), 'net_paid'],
      [fn('COUNT', col('Payroll.id')), 'count']
    ],
    raw: true
  });
  return {
    gross: parseFloat(result.gross || 0),
    net_paid: parseFloat(result.net_paid || 0),
    count: parseInt(result.count || 0, 10)
  };
};

/**
 * Profit & Loss summary
 */
const getPnl = async (companyId, { project_id = null, from = null, to = null, include_payroll = true } = {}) => {
  let projectInternalId = null;
  if (project_id) {
    const project = await Project.findOne({ where: { public_id: project_id, company_id: companyId } });
    if (project) projectInternalId = project.id;
  }

  const [invoices, bills, claims, payroll] = await Promise.all([
    sumInvoices(companyId, projectInternalId, from, to),
    sumBills(companyId, projectInternalId, from, to),
    // Claims aren't tied to a single date the same way; only filter by project if one is given
    sumClaims(companyId, projectInternalId, from, to),
    include_payroll && !projectInternalId ? sumPayroll(companyId, from, to) : Promise.resolve({ gross: 0, net_paid: 0, count: 0 })
  ]);

  const realized_revenue = invoices.received;
  const realized_expense = bills.paid + claims.paid + payroll.net_paid;
  const realized_profit = parseFloat((realized_revenue - realized_expense).toFixed(2));

  const unrealized_revenue = invoices.receivable;
  const unrealized_expense = bills.payable;
  const unrealized_profit = parseFloat((unrealized_revenue - unrealized_expense).toFixed(2));

  return {
    period: { from, to },
    project_id,
    sales: invoices,
    expenses: { bills, claims, payroll },
    realized: {
      revenue: realized_revenue,
      expense: parseFloat(realized_expense.toFixed(2)),
      profit: realized_profit,
      margin: realized_revenue > 0 ? parseFloat(((realized_profit / realized_revenue) * 100).toFixed(2)) : 0
    },
    unrealized: {
      revenue: unrealized_revenue,
      expense: parseFloat(unrealized_expense.toFixed(2)),
      profit: unrealized_profit
    }
  };
};

/**
 * Sales summary — month-over-month
 */
const getSalesByMonth = async (companyId, year, projectInternalId = null) => {
  const where = {
    company_id: companyId,
    status: { [Op.notIn]: ['Cancelled'] },
    [Op.and]: [literal(`EXTRACT(YEAR FROM "invoice_date") = ${parseInt(year, 10)}`)]
  };
  if (projectInternalId) where.project_id = projectInternalId;

  const rows = await Invoice.findAll({
    where,
    attributes: [
      [literal(`EXTRACT(MONTH FROM "invoice_date")`), 'month'],
      [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'invoiced'],
      [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'received'],
      [fn('COUNT', col('id')), 'count']
    ],
    group: [literal(`EXTRACT(MONTH FROM "invoice_date")`)],
    order: [[literal('month'), 'ASC']],
    raw: true
  });

  return rows.map(r => ({
    month: parseInt(r.month, 10),
    invoiced: parseFloat(r.invoiced || 0),
    received: parseFloat(r.received || 0),
    count: parseInt(r.count || 0, 10)
  }));
};

/**
 * Expense summary — bills + claims grouped by category, plus by month
 */
const getExpensesByCategory = async (companyId, from = null, to = null, projectInternalId = null) => {
  const where = {
    company_id: companyId,
    status: { [Op.ne]: 'Cancelled' },
    ...buildDateFilter('bill_date', from, to)
  };
  if (projectInternalId) where.project_id = projectInternalId;

  const rows = await Bill.findAll({
    where,
    attributes: [
      [fn('COALESCE', col('category'), literal(`'Uncategorised'`)), 'category'],
      [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'billed'],
      [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'paid'],
      [fn('COUNT', col('id')), 'count']
    ],
    group: ['category'],
    order: [[literal('billed'), 'DESC']],
    raw: true
  });

  return rows.map(r => ({
    category: r.category || 'Uncategorised',
    billed: parseFloat(r.billed || 0),
    paid: parseFloat(r.paid || 0),
    count: parseInt(r.count || 0, 10)
  }));
};

/**
 * P&L by project (top-level summary across all projects)
 */
const getPnlByProject = async (companyId, from = null, to = null) => {
  const projects = await Project.findAll({
    where: { company_id: companyId },
    attributes: ['id', 'public_id', 'code', 'name', 'status', 'budget']
  });

  const results = await Promise.all(projects.map(async (p) => {
    const [invoices, bills] = await Promise.all([
      sumInvoices(companyId, p.id, from, to),
      sumBills(companyId, p.id, from, to)
    ]);

    return {
      project: { public_id: p.public_id, code: p.code, name: p.name, status: p.status, budget: p.budget },
      revenue: invoices.received,
      expense: bills.paid,
      realized_profit: parseFloat((invoices.received - bills.paid).toFixed(2)),
      receivable: invoices.receivable,
      payable: bills.payable,
      unrealized_profit: parseFloat((invoices.receivable - bills.payable).toFixed(2))
    };
  }));

  return results.sort((a, b) => b.realized_profit - a.realized_profit);
};

module.exports = {
  getPnl,
  getSalesByMonth,
  getExpensesByCategory,
  getPnlByProject,
  sumInvoices,
  sumBills,
  sumClaims,
  sumPayroll
};
