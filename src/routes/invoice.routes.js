const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireManager } = require('../middleware/rbac.middleware');
const { body, param, query, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// ─── Validation Rules ──────────────────────────────────────────

const createInvoiceValidation = [
  body('invoice_date').isISO8601().withMessage('Invoice date is required'),
  body('invoice_type').optional().isIn(['01', '02', '03', '04']).withMessage('Invalid invoice type'),
  body('supplier_name').notEmpty().withMessage('Supplier name is required'),
  body('buyer_name').notEmpty().withMessage('Buyer name is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one line item is required'),
  body('items.*.description').notEmpty().withMessage('Item description is required'),
  body('items.*.unit_price').isFloat({ min: 0 }).withMessage('Unit price must be a positive number'),
  body('items.*.quantity').optional().isFloat({ min: 0.001 }).withMessage('Quantity must be positive'),
  body('items.*.tax_type').optional().isIn(['SST', 'Service Tax', 'Exempt', 'Zero Rated']).withMessage('Invalid tax type'),
  body('items.*.tax_rate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be 0-100')
];

const updateInvoiceValidation = [
  param('id').notEmpty().withMessage('Invoice ID is required'),
  body('supplier_name').optional().notEmpty().withMessage('Supplier name cannot be empty'),
  body('buyer_name').optional().notEmpty().withMessage('Buyer name cannot be empty'),
  body('items').optional().isArray({ min: 1 }).withMessage('At least one line item is required'),
  body('items.*.description').optional().notEmpty().withMessage('Item description is required'),
  body('items.*.unit_price').optional().isFloat({ min: 0 }).withMessage('Unit price must be positive')
];

const paymentValidation = [
  body('payment_date').isISO8601().withMessage('Payment date is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('payment_method').isIn(['Bank Transfer', 'Cash', 'Cheque', 'Credit Card', 'E-Wallet', 'Other']).withMessage('Invalid payment method')
];

// ─── Utility routes (must come before /:id) ────────────────────

// Analytics
router.get('/analytics', verifyToken, requireManager, invoiceController.getAnalytics);

// Generate from payroll
router.post('/generate/payroll', verifyToken, requireAdmin,
  body('payroll_id').notEmpty().withMessage('Payroll ID is required'), validate,
  invoiceController.generateFromPayroll
);

// Generate from claim
router.post('/generate/claim', verifyToken, requireAdmin,
  body('claim_id').notEmpty().withMessage('Claim ID is required'), validate,
  invoiceController.generateFromClaim
);

// Bulk submit
router.post('/bulk-submit', verifyToken, requireAdmin,
  body('invoice_ids').isArray({ min: 1 }).withMessage('At least one invoice ID is required'), validate,
  invoiceController.bulkSubmitToLhdn
);

// Validate TIN
router.post('/validate-tin', verifyToken,
  body('tin').notEmpty().withMessage('TIN is required'), validate,
  invoiceController.validateTin
);

// ─── CRUD ──────────────────────────────────────────────────────

// List invoices
router.get('/', verifyToken, invoiceController.getAllInvoices);

// Create invoice
router.post('/', verifyToken, createInvoiceValidation, validate, invoiceController.createInvoice);

// Get invoice detail
router.get('/:id', verifyToken, invoiceController.getInvoiceById);

// Update invoice
router.put('/:id', verifyToken, updateInvoiceValidation, validate, invoiceController.updateInvoice);

// Delete invoice
router.delete('/:id', verifyToken, requireAdmin, invoiceController.deleteInvoice);

// ─── Workflow ──────────────────────────────────────────────────

// Approve
router.patch('/:id/approve', verifyToken, requireManager, invoiceController.approveInvoice);

// Submit to LHDN
router.post('/:id/submit', verifyToken, requireAdmin, invoiceController.submitToLhdn);

// Check LHDN status
router.get('/:id/lhdn-status', verifyToken, requireAdmin, invoiceController.checkLhdnStatus);

// Cancel
router.patch('/:id/cancel', verifyToken, requireAdmin,
  body('reason').notEmpty().withMessage('Cancellation reason is required'), validate,
  invoiceController.cancelInvoice
);

// ─── Payments ──────────────────────────────────────────────────

router.get('/:id/payments', verifyToken, invoiceController.getPayments);
router.post('/:id/payments', verifyToken, requireAdmin, paymentValidation, validate, invoiceController.recordPayment);
router.delete('/:id/payments/:paymentId', verifyToken, requireAdmin, invoiceController.deletePayment);

// ─── PDF ───────────────────────────────────────────────────────

router.get('/:id/pdf', verifyToken, invoiceController.downloadPdf);

module.exports = router;
