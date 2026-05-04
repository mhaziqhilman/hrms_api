const { Op, fn, col, literal } = require('sequelize');
const { Project, Invoice, Bill, Claim, User, sequelize } = require('../models');
const auditService = require('../services/auditService');

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
    const { page = 1, limit = 20, status, search, sort = 'created_at', order = 'DESC' } = req.query;

    const where = { company_id: companyId };
    if (status) where.status = { [Op.in]: status.split(',') };
    if (search) {
      where[Op.or] = [
        { code: { [Op.iLike]: `%${search}%` } },
        { name: { [Op.iLike]: `%${search}%` } },
        { client_name: { [Op.iLike]: `%${search}%` } }
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

    // Compute roll-up financials
    const [salesAgg, billsAgg] = await Promise.all([
      Invoice.findOne({
        where: { project_id: project.id, company_id: project.company_id, status: { [Op.notIn]: ['Cancelled', 'Draft'] } },
        attributes: [
          [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'total_invoiced'],
          [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'total_received'],
          [fn('COALESCE', fn('SUM', col('balance_due')), 0), 'total_receivable']
        ],
        raw: true
      }),
      Bill.findOne({
        where: { project_id: project.id, company_id: project.company_id, status: { [Op.ne]: 'Cancelled' } },
        attributes: [
          [fn('COALESCE', fn('SUM', col('total_amount')), 0), 'total_billed'],
          [fn('COALESCE', fn('SUM', col('amount_paid')), 0), 'total_paid'],
          [fn('COALESCE', fn('SUM', col('balance_due')), 0), 'total_payable']
        ],
        raw: true
      })
    ]);

    const sales = parseFloat(salesAgg?.total_received || 0);
    const expenses = parseFloat(billsAgg?.total_paid || 0);

    res.json({
      success: true,
      data: {
        ...project.toJSON(),
        financials: {
          total_invoiced: parseFloat(salesAgg?.total_invoiced || 0),
          total_received: sales,
          total_receivable: parseFloat(salesAgg?.total_receivable || 0),
          total_billed: parseFloat(billsAgg?.total_billed || 0),
          total_paid: expenses,
          total_payable: parseFloat(billsAgg?.total_payable || 0),
          realized_profit: parseFloat((sales - expenses).toFixed(2)),
          unrealized_profit: parseFloat(
            (parseFloat(salesAgg?.total_receivable || 0) - parseFloat(billsAgg?.total_payable || 0)).toFixed(2)
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

    const [invoices, bills, claims] = await Promise.all([
      Invoice.findAll({
        where: { project_id: project.id },
        attributes: ['id', 'public_id', 'invoice_number', 'invoice_date', 'buyer_name', 'total_amount', 'amount_paid', 'balance_due', 'status'],
        order: [['invoice_date', 'DESC']]
      }),
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
