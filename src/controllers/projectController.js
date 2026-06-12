const { Op, fn, col, literal } = require('sequelize');
const { Project, Invoice, InvoiceItem, Bill, Claim, User, sequelize } = require('../models');
const auditService = require('../services/auditService');

// Status filter for invoice aggregations — exclude drafts and cancelled.
const ACTIVE_INVOICE_STATUSES = { [Op.notIn]: ['Cancelled', 'Draft'] };

/**
 * Return per-project invoice slices: each invoice's contribution to THIS project
 * via line items linked to it, OR via the invoice header project_id (legacy).
 * Payments are tracked at invoice level, so we prorate by the project's share.
 */
async function loadProjectInvoiceSlices(project, { statusFilter = ACTIVE_INVOICE_STATUSES } = {}) {
  // Step 1: invoice IDs that touch this project via line items
  const linkedItems = await InvoiceItem.findAll({
    where: { project_id: project.id },
    attributes: ['invoice_id'],
    raw: true
  });
  const itemInvoiceIds = [...new Set(linkedItems.map(r => r.invoice_id))];

  // Step 2: union of (header project_id = X) OR (any line item project_id = X)
  const idClauses = itemInvoiceIds.length > 0
    ? [{ project_id: project.id }, { id: { [Op.in]: itemInvoiceIds } }]
    : [{ project_id: project.id }];

  const invoices = await Invoice.findAll({
    where: {
      company_id: project.company_id,
      status: statusFilter,
      [Op.or]: idClauses
    },
    include: [{
      model: InvoiceItem,
      as: 'items',
      attributes: ['id', 'project_id', 'total'],
      required: false
    }],
    order: [['invoice_date', 'DESC']]
  });

  return invoices.map(inv => {
    const matchingLines = (inv.items || []).filter(it => it.project_id === project.id);
    // project_total: prefer line items if any line is linked; else use header
    // total (legacy invoices created before per-line linkage existed).
    const lineSum = matchingLines.reduce((s, it) => s + parseFloat(it.total || 0), 0);
    const project_total = matchingLines.length > 0
      ? lineSum
      : (inv.project_id === project.id ? parseFloat(inv.total_amount || 0) : 0);

    const invoiceTotal = parseFloat(inv.total_amount || 0);
    const ratio = invoiceTotal > 0 ? Math.min(project_total / invoiceTotal, 1) : 1;

    return {
      invoice: inv,
      project_total,
      project_amount_paid: parseFloat((parseFloat(inv.amount_paid || 0) * ratio).toFixed(2)),
      project_balance_due: parseFloat((parseFloat(inv.balance_due || 0) * ratio).toFixed(2)),
      project_line_count: matchingLines.length,
      total_line_count: (inv.items || []).length
    };
  });
}

/**
 * Aggregate invoiced / received / receivable totals for a project, slicing
 * each invoice by its per-project contribution.
 */
async function aggregateProjectInvoices(project) {
  const slices = await loadProjectInvoiceSlices(project);
  let total_invoiced = 0, total_received = 0, total_receivable = 0;
  for (const s of slices) {
    total_invoiced += s.project_total;
    total_received += s.project_amount_paid;
    total_receivable += s.project_balance_due;
  }
  return {
    total_invoiced: parseFloat(total_invoiced.toFixed(2)),
    total_received: parseFloat(total_received.toFixed(2)),
    total_receivable: parseFloat(total_receivable.toFixed(2))
  };
}

// POST /api/projects
const createProject = async (req, res, next) => {
  try {
    const companyId = req.user.company_id;
    const userId = req.user.id;
    const {
      code, name, description, client_name, status,
      start_date, end_date, budget, currency, manager_id, notes,
      po_number, po_date, po_value, po_currency, po_duration_months, po_document_url
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Code and name are required' });
    }

    const exists = await Project.findOne({ where: { company_id: companyId, code } });
    if (exists) {
      return res.status(400).json({ success: false, message: 'A project with this code already exists' });
    }

    // If PO value supplied without budget, default budget to PO value
    const resolvedBudget = budget != null && budget !== '' ? budget : (po_value || null);

    // If PO duration supplied without end_date, derive end_date from start_date
    let resolvedEndDate = end_date || null;
    if (!resolvedEndDate && start_date && po_duration_months) {
      const sd = new Date(start_date);
      sd.setMonth(sd.getMonth() + parseInt(po_duration_months, 10));
      resolvedEndDate = sd.toISOString().slice(0, 10);
    }

    const project = await Project.create({
      company_id: companyId,
      code, name, description, client_name,
      status: status || 'Planning',
      start_date,
      end_date: resolvedEndDate,
      budget: resolvedBudget,
      currency: currency || 'MYR',
      po_number: po_number || null,
      po_date: po_date || null,
      po_value: po_value || null,
      po_currency: po_currency || (po_value ? (currency || 'MYR') : null),
      po_duration_months: po_duration_months || null,
      po_document_url: po_document_url || null,
      manager_id: manager_id || null,
      notes,
      created_by: userId
    });

    auditService.log({
      action: 'project_created',
      userId, companyId,
      targetType: 'Project',
      targetId: project.id,
      details: { code, name }
    });

    res.status(201).json({ success: true, message: 'Project created', data: project });
  } catch (error) { next(error); }
};

// GET /api/projects
const getAllProjects = async (req, res, next) => {
  try {
    const companyId = req.user.company_id;
    const { page = 1, limit = 20, status, search, year, sort = 'created_at', order = 'DESC' } = req.query;

    const where = { company_id: companyId };
    if (status) where.status = { [Op.in]: status.split(',') };
    if (search) {
      where[Op.or] = [
        { code: { [Op.iLike]: `%${search}%` } },
        { name: { [Op.iLike]: `%${search}%` } },
        { client_name: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Year filter — match projects whose start/end date range touches the given year
    if (year && /^\d{4}$/.test(String(year))) {
      const startOfYear = `${year}-01-01`;
      const endOfYear = `${year}-12-31`;
      where[Op.and] = [
        ...(where[Op.and] || []),
        {
          [Op.or]: [
            // project span overlaps the year (both dates set)
            { start_date: { [Op.lte]: endOfYear }, end_date: { [Op.gte]: startOfYear } },
            // start date falls within the year
            { start_date: { [Op.between]: [startOfYear, endOfYear] } },
            // end date falls within the year
            { end_date: { [Op.between]: [startOfYear, endOfYear] } }
          ]
        }
      ];
    }

    const allowed = ['created_at', 'name', 'code', 'start_date', 'end_date', 'status'];
    const sortField = allowed.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows } = await Project.findAndCountAll({
      where,
      include: [
        { model: User, as: 'manager', attributes: ['id', 'email'] },
        { model: User, as: 'creator', attributes: ['id', 'email'] }
      ],
      order: [[sortField, sortOrder]],
      limit: parseInt(limit),
      offset,
      distinct: true
    });

    res.json({
      success: true,
      data: {
        projects: rows,
        pagination: {
          page: parseInt(page), limit: parseInt(limit),
          totalItems: count, totalPages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) { next(error); }
};

// GET /api/projects/:id
const getProjectById = async (req, res, next) => {
  try {
    const project = await Project.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id },
      include: [
        { model: User, as: 'manager', attributes: ['id', 'email'] },
        { model: User, as: 'creator', attributes: ['id', 'email'] }
      ]
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Compute roll-up financials — aggregate via line items so multi-PO invoices
    // contribute only the lines that belong to THIS project (proration applied
    // to payments since payment is tracked at invoice level).
    const salesAgg = await aggregateProjectInvoices(project);
    const billsAgg = await Bill.findOne({
      where: { project_id: project.id, company_id: project.company_id, status: { [Op.ne]: 'Cancelled' } },
      attributes: [
        [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'total_billed'],
        [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'total_paid'],
        [fn('COALESCE', fn('SUM', col('balance_due')), 0), 'total_payable']
      ],
      raw: true
    });

    const sales = salesAgg.total_received;
    const expenses = parseFloat(billsAgg?.total_paid || 0);

    res.json({
      success: true,
      data: {
        ...project.toJSON(),
        financials: {
          total_invoiced: salesAgg.total_invoiced,
          total_received: sales,
          total_receivable: salesAgg.total_receivable,
          total_billed: parseFloat(billsAgg?.total_billed || 0),
          total_paid: expenses,
          total_payable: parseFloat(billsAgg?.total_payable || 0),
          realized_profit: parseFloat((sales - expenses).toFixed(2)),
          unrealized_profit: parseFloat(
            (salesAgg.total_receivable - parseFloat(billsAgg?.total_payable || 0)).toFixed(2)
          )
        }
      }
    });
  } catch (error) { next(error); }
};

// PUT /api/projects/:id
const updateProject = async (req, res, next) => {
  try {
    const project = await Project.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const allowed = [
      'code', 'name', 'description', 'client_name', 'status',
      'start_date', 'end_date', 'budget', 'currency', 'manager_id', 'notes',
      'po_number', 'po_date', 'po_value', 'po_currency', 'po_duration_months', 'po_document_url'
    ];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    if (updates.code && updates.code !== project.code) {
      const exists = await Project.findOne({
        where: { company_id: req.user.company_id, code: updates.code, id: { [Op.ne]: project.id } }
      });
      if (exists) return res.status(400).json({ success: false, message: 'Project code already in use' });
    }

    await project.update(updates);
    res.json({ success: true, message: 'Project updated', data: project });
  } catch (error) { next(error); }
};

// DELETE /api/projects/:id
const deleteProject = async (req, res, next) => {
  try {
    const project = await Project.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Don't hard-delete if there's linked financial activity
    const linkedInvoices = await Invoice.count({ where: { project_id: project.id } });
    const linkedBills = await Bill.count({ where: { project_id: project.id } });
    if (linkedInvoices > 0 || linkedBills > 0) {
      return res.status(400).json({
        success: false,
        message: 'Project has linked invoices/bills — cancel the project instead of deleting'
      });
    }

    await project.destroy();
    res.json({ success: true, message: 'Project deleted' });
  } catch (error) { next(error); }
};

// GET /api/projects/:id/transactions  — invoices + bills + claims for a project
const getProjectTransactions = async (req, res, next) => {
  try {
    const project = await Project.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    // Invoices: include legacy-status (Draft etc.) too for full visibility on the
    // transactions tab — only the financial roll-up excludes them.
    const [invoiceSlices, bills, claims] = await Promise.all([
      loadProjectInvoiceSlices(project, { statusFilter: { [Op.ne]: null } }),
      Bill.findAll({
        where: { project_id: project.id },
        attributes: ['id', 'public_id', 'bill_number', 'bill_type', 'bill_date', 'vendor_name', 'category', 'total_amount', 'amount_paid', 'balance_due', 'status'],
        order: [['bill_date', 'DESC']]
      }),
      Claim.findAll({
        where: { project_id: project.id },
        attributes: ['id', 'public_id', 'date', 'amount', 'description', 'status']
      })
    ]);

    // Flatten slices: invoice fields + project-specific contribution fields.
    const invoices = invoiceSlices.map(s => {
      const inv = s.invoice;
      return {
        id: inv.id,
        public_id: inv.public_id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        buyer_name: inv.buyer_name,
        total_amount: parseFloat(inv.total_amount || 0),
        amount_paid: parseFloat(inv.amount_paid || 0),
        balance_due: parseFloat(inv.balance_due || 0),
        status: inv.status,
        // Per-project slice
        project_total: s.project_total,
        project_amount_paid: s.project_amount_paid,
        project_balance_due: s.project_balance_due,
        project_line_count: s.project_line_count,
        total_line_count: s.total_line_count
      };
    });

    res.json({ success: true, data: { invoices, bills, claims } });
  } catch (error) { next(error); }
};

module.exports = {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
  getProjectTransactions
};
