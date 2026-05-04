const { Op } = require('sequelize');
const { Bill, BillItem, BillPayment, Project, User } = require('../models');
const billService = require('../services/billService');
const auditService = require('../services/auditService');

// POST /api/bills
const createBill = async (req, res, next) => {
  try {
    const companyId = req.user.company_id;
    const userId = req.user.id;
    const { items: rawItems, project_public_id, ...billData } = req.body;

    if (!rawItems || rawItems.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one line item is required' });
    }

    let projectId = null;
    if (project_public_id) {
      const project = await Project.findOne({ where: { public_id: project_public_id, company_id: companyId } });
      if (!project) {
        return res.status(400).json({ success: false, message: 'Project not found' });
      }
      projectId = project.id;
    }

    const billNumber = await billService.generateBillNumber(companyId, billData.bill_type);

    const calculatedItems = rawItems.map((it, idx) =>
      billService.calculateItemTotals({ ...it, item_number: idx + 1 })
    );
    const totals = billService.calculateBillTotals(calculatedItems);

    const bill = await Bill.create({
      ...billData,
      company_id: companyId,
      project_id: projectId,
      bill_number: billNumber,
      ...totals,
      balance_due: totals.total_amount,
      status: billData.status || 'Draft',
      created_by: userId
    });

    await BillItem.bulkCreate(calculatedItems.map(it => ({ ...it, bill_id: bill.id })));

    const result = await Bill.findByPk(bill.id, {
      include: [
        { model: BillItem, as: 'items' },
        { model: Project, as: 'project', attributes: ['id', 'public_id', 'code', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'email'] }
      ]
    });

    auditService.log({
      action: 'bill_created',
      userId, companyId,
      targetType: 'Bill',
      targetId: bill.id,
      details: { bill_number: bill.bill_number, vendor: bill.vendor_name, amount: bill.total_amount }
    });

    res.status(201).json({ success: true, message: 'Bill created', data: result });
  } catch (error) { next(error); }
};

// GET /api/bills
const getAllBills = async (req, res, next) => {
  try {
    const companyId = req.user.company_id;
    const { page = 1, limit = 20, status, bill_type, project_id, search, date_from, date_to, sort = 'bill_date', order = 'DESC' } = req.query;

    const where = { company_id: companyId };
    if (status) where.status = { [Op.in]: status.split(',') };
    if (bill_type) where.bill_type = bill_type;
    if (search) {
      where[Op.or] = [
        { bill_number: { [Op.iLike]: `%${search}%` } },
        { vendor_name: { [Op.iLike]: `%${search}%` } },
        { vendor_invoice_number: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (date_from || date_to) {
      where.bill_date = {};
      if (date_from) where.bill_date[Op.gte] = date_from;
      if (date_to) where.bill_date[Op.lte] = date_to;
    }

    const include = [
      { model: Project, as: 'project', attributes: ['id', 'public_id', 'code', 'name'] },
      { model: User, as: 'creator', attributes: ['id', 'email'] }
    ];

    if (project_id) {
      const project = await Project.findOne({ where: { public_id: project_id, company_id: companyId } });
      if (project) where.project_id = project.id;
    }

    const allowed = ['bill_date', 'created_at', 'bill_number', 'total_amount', 'status', 'due_date'];
    const sortField = allowed.includes(sort) ? sort : 'bill_date';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Bill.findAndCountAll({
      where, include,
      order: [[sortField, sortOrder]],
      limit: parseInt(limit), offset, distinct: true
    });

    res.json({
      success: true,
      data: {
        bills: rows,
        pagination: {
          page: parseInt(page), limit: parseInt(limit),
          totalItems: count, totalPages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) { next(error); }
};

// GET /api/bills/:id
const getBillById = async (req, res, next) => {
  try {
    const bill = await Bill.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id },
      include: [
        { model: BillItem, as: 'items' },
        { model: BillPayment, as: 'payments', include: [{ model: User, as: 'recorder', attributes: ['id', 'email'] }] },
        { model: Project, as: 'project', attributes: ['id', 'public_id', 'code', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'email'] }
      ]
    });

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    res.json({ success: true, data: bill });
  } catch (error) { next(error); }
};

// PUT /api/bills/:id
const updateBill = async (req, res, next) => {
  try {
    const bill = await Bill.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    if (!['Draft'].includes(bill.status)) {
      return res.status(400).json({ success: false, message: 'Only Draft bills can be edited' });
    }

    const { items: rawItems, project_public_id, ...billData } = req.body;

    if (project_public_id !== undefined) {
      if (project_public_id === null || project_public_id === '') {
        billData.project_id = null;
      } else {
        const project = await Project.findOne({ where: { public_id: project_public_id, company_id: req.user.company_id } });
        if (!project) return res.status(400).json({ success: false, message: 'Project not found' });
        billData.project_id = project.id;
      }
    }

    if (rawItems && rawItems.length > 0) {
      await BillItem.destroy({ where: { bill_id: bill.id } });
      const calculatedItems = rawItems.map((it, idx) =>
        billService.calculateItemTotals({ ...it, item_number: idx + 1 })
      );
      const totals = billService.calculateBillTotals(calculatedItems);
      await BillItem.bulkCreate(calculatedItems.map(it => ({ ...it, bill_id: bill.id })));
      Object.assign(billData, totals);
      billData.balance_due = totals.total_amount - parseFloat(bill.amount_paid || 0);
    }

    await bill.update(billData);
    res.json({ success: true, message: 'Bill updated', data: bill });
  } catch (error) { next(error); }
};

// DELETE /api/bills/:id
const deleteBill = async (req, res, next) => {
  try {
    const bill = await Bill.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    if (bill.status !== 'Draft') {
      return res.status(400).json({ success: false, message: 'Only Draft bills can be deleted' });
    }
    await bill.destroy();
    res.json({ success: true, message: 'Bill deleted' });
  } catch (error) { next(error); }
};

// PATCH /api/bills/:id/approve
const approveBill = async (req, res, next) => {
  try {
    const bill = await Bill.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    if (bill.status !== 'Draft') {
      return res.status(400).json({ success: false, message: 'Only Draft bills can be approved' });
    }

    await bill.update({
      status: 'Approved',
      approved_by: req.user.id,
      approved_at: new Date()
    });

    auditService.log({
      action: 'bill_approved',
      userId: req.user.id, companyId: req.user.company_id,
      targetType: 'Bill', targetId: bill.id,
      details: { bill_number: bill.bill_number, amount: bill.total_amount }
    });

    res.json({ success: true, message: 'Bill approved', data: bill });
  } catch (error) { next(error); }
};

// PATCH /api/bills/:id/cancel
const cancelBill = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const bill = await Bill.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    if (['Paid', 'Cancelled'].includes(bill.status)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel paid or already cancelled bills' });
    }
    await bill.update({ status: 'Cancelled', notes: reason ? `${bill.notes || ''}\nCancelled: ${reason}` : bill.notes });
    res.json({ success: true, message: 'Bill cancelled', data: bill });
  } catch (error) { next(error); }
};

// POST /api/bills/:id/payments
const recordPayment = async (req, res, next) => {
  try {
    const bill = await Bill.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });
    if (!['Approved', 'Received', 'Partial_Paid'].includes(bill.status)) {
      return res.status(400).json({ success: false, message: 'Bill must be Approved/Received/Partial_Paid to record payment' });
    }

    const { payment_date, amount, payment_method, reference_number, notes } = req.body;
    const paymentAmount = parseFloat(amount);
    if (paymentAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be > 0' });
    }
    if (paymentAmount > parseFloat(bill.balance_due)) {
      return res.status(400).json({ success: false, message: 'Payment exceeds balance due' });
    }

    const payment = await BillPayment.create({
      bill_id: bill.id,
      payment_date, amount: paymentAmount,
      payment_method, reference_number, notes,
      created_by: req.user.id
    });

    const newPaid = parseFloat(bill.amount_paid) + paymentAmount;
    const newBalance = parseFloat((parseFloat(bill.total_amount) - newPaid).toFixed(2));
    const newStatus = newBalance <= 0.001 ? 'Paid' : 'Partial_Paid';

    await bill.update({
      amount_paid: parseFloat(newPaid.toFixed(2)),
      balance_due: Math.max(0, newBalance),
      status: newStatus,
      paid_at: newStatus === 'Paid' ? new Date() : bill.paid_at
    });

    if (newStatus === 'Paid') {
      auditService.log({
        action: 'bill_paid',
        userId: req.user.id, companyId: req.user.company_id,
        targetType: 'Bill', targetId: bill.id,
        details: { bill_number: bill.bill_number, total: bill.total_amount }
      });
    }

    res.status(201).json({ success: true, message: 'Payment recorded', data: payment });
  } catch (error) { next(error); }
};

// GET /api/bills/:id/payments
const getPayments = async (req, res, next) => {
  try {
    const bill = await Bill.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });

    const payments = await BillPayment.findAll({
      where: { bill_id: bill.id },
      include: [{ model: User, as: 'recorder', attributes: ['id', 'email'] }],
      order: [['payment_date', 'DESC']]
    });
    res.json({ success: true, data: payments });
  } catch (error) { next(error); }
};

// DELETE /api/bills/:id/payments/:paymentId
const deletePayment = async (req, res, next) => {
  try {
    const bill = await Bill.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });
    if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });

    const payment = await BillPayment.findOne({
      where: { id: req.params.paymentId, bill_id: bill.id }
    });
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });

    const paymentAmount = parseFloat(payment.amount);
    await payment.destroy();

    const newPaid = Math.max(0, parseFloat(bill.amount_paid) - paymentAmount);
    const newBalance = parseFloat((parseFloat(bill.total_amount) - newPaid).toFixed(2));
    const newStatus = newPaid <= 0.001 ? 'Approved' : (newBalance <= 0.001 ? 'Paid' : 'Partial_Paid');

    await bill.update({
      amount_paid: parseFloat(newPaid.toFixed(2)),
      balance_due: newBalance,
      status: newStatus,
      paid_at: newStatus === 'Paid' ? bill.paid_at : null
    });

    res.json({ success: true, message: 'Payment removed' });
  } catch (error) { next(error); }
};

module.exports = {
  createBill,
  getAllBills,
  getBillById,
  updateBill,
  deleteBill,
  approveBill,
  cancelBill,
  recordPayment,
  getPayments,
  deletePayment
};
