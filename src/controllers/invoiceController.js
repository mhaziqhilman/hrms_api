const { Op } = require('sequelize');
const { Invoice, InvoiceItem, InvoicePayment, Company, User, Payroll, Claim } = require('../models');
const invoiceService = require('../services/invoiceService');
const lhdnService = require('../services/lhdnService');
const invoicePdfService = require('../services/invoicePdfService');
const notificationService = require('../services/notificationService');
const auditService = require('../services/auditService');
const logger = require('../utils/logger');

// ─── CRUD ──────────────────────────────────────────────────────

/**
 * POST /api/invoices — Create a new invoice with items
 */
const createInvoice = async (req, res, next) => {
  try {
    const { items: rawItems, ...invoiceData } = req.body;
    const companyId = req.user.company_id;
    const userId = req.user.id;

    if (!rawItems || rawItems.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one line item is required' });
    }

    const invoiceNumber = await invoiceService.generateInvoiceNumber(companyId);

    // Calculate item totals
    const calculatedItems = rawItems.map((item, idx) =>
      invoiceService.calculateItemTotals({ ...item, item_number: idx + 1 })
    );
    const totals = invoiceService.calculateInvoiceTotals(calculatedItems);

    const invoice = await Invoice.create({
      ...invoiceData,
      company_id: companyId,
      invoice_number: invoiceNumber,
      ...totals,
      balance_due: totals.total_amount,
      source_type: invoiceData.source_type || 'manual',
      status: invoiceData.status === 'Pending' ? 'Pending' : 'Draft',
      created_by: userId
    });

    await InvoiceItem.bulkCreate(
      calculatedItems.map(item => ({ ...item, invoice_id: invoice.id }))
    );

    if (invoiceData.status === 'Pending') {
      invoice.approved_by = userId;
      invoice.approved_at = new Date();
      await invoice.save();
    }

    const result = await Invoice.findByPk(invoice.id, {
      include: [
        { model: InvoiceItem, as: 'items' },
        { model: User, as: 'creator', attributes: ['id', 'email'] }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invoices — List invoices with pagination, filters, search
 */
const getAllInvoices = async (req, res, next) => {
  try {
    const companyId = req.user.company_id;
    const {
      page = 1, limit = 20,
      status, invoice_type, is_self_billed,
      search, date_from, date_to,
      sort = 'created_at', order = 'DESC'
    } = req.query;

    const where = { company_id: companyId };

    if (status) {
      where.status = { [Op.in]: status.split(',') };
    }
    if (invoice_type) {
      where.invoice_type = invoice_type;
    }
    if (is_self_billed !== undefined) {
      where.is_self_billed = is_self_billed === 'true';
    }
    if (search) {
      where[Op.or] = [
        { invoice_number: { [Op.iLike]: `%${search}%` } },
        { supplier_name: { [Op.iLike]: `%${search}%` } },
        { buyer_name: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (date_from || date_to) {
      where.invoice_date = {};
      if (date_from) where.invoice_date[Op.gte] = date_from;
      if (date_to) where.invoice_date[Op.lte] = date_to;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const allowedSortFields = ['created_at', 'invoice_date', 'invoice_number', 'total_amount', 'status'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await Invoice.findAndCountAll({
      where,
      include: [
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
        invoices: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalItems: count,
          totalPages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invoices/:id — Get invoice detail with items and payments
 */
const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id },
      include: [
        { model: InvoiceItem, as: 'items', order: [['item_number', 'ASC']] },
        { model: InvoicePayment, as: 'payments', include: [{ model: User, as: 'recorder', attributes: ['id', 'email'] }] },
        { model: User, as: 'creator', attributes: ['id', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'email'] },
        { model: User, as: 'canceller', attributes: ['id', 'email'] }
      ]
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/invoices/:id — Update invoice (Draft/Invalid only)
 */
const updateInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (!['Draft', 'Invalid'].includes(invoice.status)) {
      return res.status(400).json({ success: false, message: 'Only Draft or Invalid invoices can be edited' });
    }

    const { items: rawItems, ...invoiceData } = req.body;

    if (rawItems && rawItems.length > 0) {
      // Replace all items
      await InvoiceItem.destroy({ where: { invoice_id: invoice.id } });

      const calculatedItems = rawItems.map((item, idx) =>
        invoiceService.calculateItemTotals({ ...item, item_number: idx + 1 })
      );
      const totals = invoiceService.calculateInvoiceTotals(calculatedItems);

      await InvoiceItem.bulkCreate(
        calculatedItems.map(item => ({ ...item, invoice_id: invoice.id }))
      );

      Object.assign(invoiceData, totals);
      invoiceData.balance_due = totals.total_amount - parseFloat(invoice.amount_paid || 0);
    }

    // Reset invalid status back to Draft on edit
    if (invoice.status === 'Invalid') {
      invoiceData.status = 'Draft';
      invoiceData.lhdn_validation_errors = null;
    }

    invoiceData.updated_by = req.user.id;
    await invoice.update(invoiceData);

    const result = await Invoice.findByPk(invoice.id, {
      include: [
        { model: InvoiceItem, as: 'items' },
        { model: User, as: 'creator', attributes: ['id', 'email'] }
      ]
    });

    res.json({ success: true, message: 'Invoice updated successfully', data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/invoices/:id — Delete invoice (Draft only)
 */
const deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (invoice.status !== 'Draft') {
      return res.status(400).json({ success: false, message: 'Only Draft invoices can be deleted' });
    }

    await invoice.destroy(); // CASCADE deletes items and payments
    res.json({ success: true, message: 'Invoice deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ─── Workflow Actions ──────────────────────────────────────────

/**
 * PATCH /api/invoices/:id/approve — Draft → Pending
 */
const approveInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (invoice.status !== 'Draft') {
      return res.status(400).json({ success: false, message: 'Only Draft invoices can be approved' });
    }

    await invoice.update({
      status: 'Pending',
      approved_by: req.user.id,
      approved_at: new Date()
    });

    auditService.log({
      action: 'invoice_approved',
      userId: req.user.id,
      companyId: req.user.company_id,
      targetType: 'Invoice',
      targetId: invoice.id,
      details: { invoice_number: invoice.invoice_number }
    });

    res.json({ success: true, message: 'Invoice approved and ready for LHDN submission', data: invoice });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/invoices/:id/submit — Pending → Submitted (calls LHDN)
 */
const submitToLhdn = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id },
      include: [{ model: InvoiceItem, as: 'items' }]
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (invoice.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Only Pending invoices can be submitted to LHDN' });
    }

    const result = await lhdnService.submitDocument(invoice.toJSON(), invoice.items.map(i => i.toJSON()));

    if (result.acceptedDocuments && result.acceptedDocuments.length > 0) {
      const accepted = result.acceptedDocuments[0];
      await invoice.update({
        status: 'Submitted',
        lhdn_uuid: accepted.uuid,
        lhdn_long_id: accepted.longId,
        lhdn_submission_uid: result.submissionUID,
        lhdn_submitted_at: new Date()
      });

      // Notify admin
      notificationService.createNotification(
        invoice.created_by, req.user.company_id,
        'invoice_submitted',
        'Invoice Submitted to LHDN',
        `Invoice ${invoice.invoice_number} has been submitted to LHDN for validation.`,
        { invoice_id: invoice.public_id }
      );

      auditService.log({
        action: 'invoice_submitted_lhdn',
        userId: req.user.id,
        companyId: req.user.company_id,
        targetType: 'Invoice',
        targetId: invoice.id,
        details: { invoice_number: invoice.invoice_number, lhdn_uuid: accepted.uuid }
      });

      res.json({ success: true, message: 'Invoice submitted to LHDN successfully', data: invoice });
    } else {
      // Rejected at submission
      const rejected = result.rejectedDocuments?.[0];
      await invoice.update({
        status: 'Invalid',
        lhdn_validation_errors: rejected?.error?.details || [{ message: rejected?.error?.message || 'Submission rejected' }]
      });

      res.json({
        success: false,
        message: 'Invoice was rejected by LHDN',
        data: invoice,
        errors: rejected?.error?.details || []
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invoices/:id/lhdn-status — Poll LHDN for status update
 */
const checkLhdnStatus = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (!invoice.lhdn_uuid) {
      return res.status(400).json({ success: false, message: 'Invoice has not been submitted to LHDN' });
    }

    if (!['Submitted'].includes(invoice.status)) {
      return res.json({ success: true, message: `Invoice already in ${invoice.status} status`, data: invoice });
    }

    const result = await lhdnService.getDocumentStatus(invoice.lhdn_uuid);

    if (result.status === 'Valid') {
      const qrUrl = `https://myinvois.hasil.gov.my/${invoice.lhdn_uuid}/share/${invoice.lhdn_long_id}`;
      await invoice.update({
        status: 'Valid',
        lhdn_status: 'Valid',
        lhdn_validated_at: result.dateTimeValidated || new Date(),
        lhdn_qr_url: qrUrl
      });

      notificationService.createNotification(
        invoice.created_by, req.user.company_id,
        'invoice_validated',
        'Invoice Validated by LHDN',
        `Invoice ${invoice.invoice_number} has been validated by LHDN.`,
        { invoice_id: invoice.public_id }
      );
    } else if (result.status === 'Invalid') {
      const errors = result.validationResults?.validationSteps?.map(s => ({
        code: s.error?.code,
        message: s.error?.message,
        name: s.name
      })) || [];

      await invoice.update({
        status: 'Invalid',
        lhdn_status: 'Invalid',
        lhdn_validation_errors: errors
      });

      notificationService.createNotification(
        invoice.created_by, req.user.company_id,
        'invoice_rejected',
        'Invoice Rejected by LHDN',
        `Invoice ${invoice.invoice_number} was rejected by LHDN. Please review and fix the errors.`,
        { invoice_id: invoice.public_id, errors }
      );
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/invoices/:id/cancel — Valid → Cancelled
 */
const cancelInvoice = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
    }

    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (invoice.status !== 'Valid') {
      return res.status(400).json({ success: false, message: 'Only Valid invoices can be cancelled' });
    }

    // Check 72-hour window
    if (invoice.lhdn_validated_at) {
      const hoursSinceValidation = (Date.now() - new Date(invoice.lhdn_validated_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceValidation > 72) {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel invoice after 72 hours of validation. Please issue a Credit Note instead.'
        });
      }
    }

    // Cancel with LHDN if it has UUID
    if (invoice.lhdn_uuid) {
      await lhdnService.cancelDocument(invoice.lhdn_uuid, reason);
    }

    await invoice.update({
      status: 'Cancelled',
      lhdn_status: 'Cancelled',
      cancelled_by: req.user.id,
      cancelled_at: new Date(),
      cancellation_reason: reason
    });

    notificationService.createNotification(
      invoice.created_by, req.user.company_id,
      'invoice_cancelled',
      'Invoice Cancelled',
      `Invoice ${invoice.invoice_number} has been cancelled. Reason: ${reason}`,
      { invoice_id: invoice.public_id }
    );

    auditService.log({
      action: 'invoice_cancelled',
      userId: req.user.id,
      companyId: req.user.company_id,
      targetType: 'Invoice',
      targetId: invoice.id,
      details: { invoice_number: invoice.invoice_number, reason }
    });

    res.json({ success: true, message: 'Invoice cancelled successfully', data: invoice });
  } catch (error) {
    next(error);
  }
};

// ─── Payments ──────────────────────────────────────────────────

/**
 * POST /api/invoices/:id/payments — Record a payment
 */
const recordPayment = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    if (!['Valid', 'Pending', 'Submitted'].includes(invoice.status)) {
      return res.status(400).json({ success: false, message: 'Payments can only be recorded for Valid/Pending/Submitted invoices' });
    }

    const { payment_date, amount, payment_method, reference_number, notes } = req.body;
    const paymentAmount = parseFloat(amount);

    if (paymentAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });
    }

    if (paymentAmount > parseFloat(invoice.balance_due)) {
      return res.status(400).json({ success: false, message: 'Payment amount exceeds balance due' });
    }

    const payment = await InvoicePayment.create({
      invoice_id: invoice.id,
      payment_date,
      amount: paymentAmount,
      payment_method,
      reference_number,
      notes,
      created_by: req.user.id
    });

    const newPaid = parseFloat(invoice.amount_paid) + paymentAmount;
    await invoice.update({
      amount_paid: parseFloat(newPaid.toFixed(2)),
      balance_due: parseFloat((parseFloat(invoice.total_amount) - newPaid).toFixed(2))
    });

    res.status(201).json({ success: true, message: 'Payment recorded successfully', data: payment });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invoices/:id/payments — List payments for an invoice
 */
const getPayments = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const payments = await InvoicePayment.findAll({
      where: { invoice_id: invoice.id },
      include: [{ model: User, as: 'recorder', attributes: ['id', 'email'] }],
      order: [['payment_date', 'DESC']]
    });

    res.json({ success: true, data: payments });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/invoices/:id/payments/:paymentId — Remove a payment
 */
const deletePayment = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const payment = await InvoicePayment.findOne({
      where: { id: req.params.paymentId, invoice_id: invoice.id }
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const paymentAmount = parseFloat(payment.amount);
    await payment.destroy();

    const newPaid = parseFloat(invoice.amount_paid) - paymentAmount;
    await invoice.update({
      amount_paid: parseFloat(Math.max(0, newPaid).toFixed(2)),
      balance_due: parseFloat((parseFloat(invoice.total_amount) - Math.max(0, newPaid)).toFixed(2))
    });

    res.json({ success: true, message: 'Payment removed successfully' });
  } catch (error) {
    next(error);
  }
};

// ─── Generation & Utilities ────────────────────────────────────

/**
 * GET /api/invoices/:id/pdf — Download invoice PDF
 */
const downloadPdf = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id },
      include: [
        { model: InvoiceItem, as: 'items' },
        { model: InvoicePayment, as: 'payments' }
      ]
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const pdfBuffer = await invoicePdfService.generatePdf(
      invoice.toJSON(),
      invoice.items.map(i => i.toJSON()),
      invoice.payments.map(p => p.toJSON())
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invoices/analytics — Dashboard analytics
 */
const getAnalytics = async (req, res, next) => {
  try {
    const analytics = await invoiceService.getAnalytics(req.user.company_id);
    res.json({ success: true, data: analytics });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/invoices/generate/payroll — Auto-create from payroll
 */
const generateFromPayroll = async (req, res, next) => {
  try {
    const { payroll_id } = req.body;

    // Look up payroll by public_id
    const payroll = await Payroll.findOne({ where: { public_id: payroll_id } });
    if (!payroll) {
      return res.status(404).json({ success: false, message: 'Payroll record not found' });
    }

    const invoice = await invoiceService.generateFromPayroll(payroll.id, req.user.company_id, req.user.id);
    res.status(201).json({ success: true, message: 'Invoice generated from payroll', data: invoice });
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('must be')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * POST /api/invoices/generate/claim — Auto-create from claim
 */
const generateFromClaim = async (req, res, next) => {
  try {
    const { claim_id } = req.body;

    const claim = await Claim.findOne({ where: { public_id: claim_id } });
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim record not found' });
    }

    const invoice = await invoiceService.generateFromClaim(claim.id, req.user.company_id, req.user.id);
    res.status(201).json({ success: true, message: 'Invoice generated from claim', data: invoice });
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('must be')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * POST /api/invoices/bulk-submit — Batch submit to LHDN
 */
const bulkSubmitToLhdn = async (req, res, next) => {
  try {
    const { invoice_ids } = req.body;
    if (!invoice_ids || invoice_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No invoice IDs provided' });
    }

    const invoices = await Invoice.findAll({
      where: {
        public_id: { [Op.in]: invoice_ids },
        company_id: req.user.company_id,
        status: 'Pending'
      },
      include: [{ model: InvoiceItem, as: 'items' }]
    });

    const results = { accepted: [], rejected: [], skipped: [] };

    for (const invoice of invoices) {
      try {
        const result = await lhdnService.submitDocument(invoice.toJSON(), invoice.items.map(i => i.toJSON()));

        if (result.acceptedDocuments?.length > 0) {
          const accepted = result.acceptedDocuments[0];
          await invoice.update({
            status: 'Submitted',
            lhdn_uuid: accepted.uuid,
            lhdn_long_id: accepted.longId,
            lhdn_submission_uid: result.submissionUID,
            lhdn_submitted_at: new Date()
          });
          results.accepted.push(invoice.invoice_number);
        } else {
          const rejected = result.rejectedDocuments?.[0];
          await invoice.update({
            status: 'Invalid',
            lhdn_validation_errors: rejected?.error?.details || []
          });
          results.rejected.push({ invoice_number: invoice.invoice_number, errors: rejected?.error?.details });
        }
      } catch (err) {
        results.skipped.push({ invoice_number: invoice.invoice_number, error: err.message });
      }
    }

    const skippedIds = invoice_ids.length - invoices.length;
    if (skippedIds > 0) {
      results.skipped.push({ message: `${skippedIds} invoice(s) were not in Pending status` });
    }

    res.json({
      success: true,
      message: `Bulk submission complete: ${results.accepted.length} accepted, ${results.rejected.length} rejected, ${results.skipped.length} skipped`,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/invoices/validate-tin — Validate a TIN number
 */
const validateTin = async (req, res, next) => {
  try {
    const { tin } = req.body;
    if (!tin) {
      return res.status(400).json({ success: false, message: 'TIN is required' });
    }

    const result = await lhdnService.validateTIN(tin);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createInvoice,
  getAllInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  approveInvoice,
  submitToLhdn,
  checkLhdnStatus,
  cancelInvoice,
  recordPayment,
  getPayments,
  deletePayment,
  downloadPdf,
  getAnalytics,
  generateFromPayroll,
  generateFromClaim,
  bulkSubmitToLhdn,
  validateTin
};
