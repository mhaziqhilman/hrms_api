const express = require('express');
const router = express.Router();
const billController = require('../controllers/billController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireManager } = require('../middleware/rbac.middleware');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }
  next();
};

const createValidation = [
  body('bill_date').isISO8601().withMessage('Bill date is required'),
  body('vendor_name').notEmpty().withMessage('Vendor name is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one line item is required'),
  body('items.*.description').notEmpty().withMessage('Item description is required'),
  body('items.*.unit_price').isFloat({ min: 0 }).withMessage('Unit price must be positive'),
  body('bill_type').optional().isIn(['PO', 'Bill', 'Expense'])
];

const paymentValidation = [
  body('payment_date').isISO8601().withMessage('Payment date is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be > 0'),
  body('payment_method').isIn(['Bank Transfer', 'Cash', 'Cheque', 'Credit Card', 'E-Wallet', 'Other']).withMessage('Invalid payment method')
];

router.get('/', verifyToken, billController.getAllBills);
router.post('/', verifyToken, requireManager, createValidation, validate, billController.createBill);
router.get('/:id', verifyToken, billController.getBillById);
router.put('/:id', verifyToken, requireManager, billController.updateBill);
router.delete('/:id', verifyToken, requireAdmin, billController.deleteBill);

router.patch('/:id/approve', verifyToken, requireAdmin, billController.approveBill);
router.patch('/:id/cancel', verifyToken, requireAdmin, billController.cancelBill);

router.get('/:id/payments', verifyToken, billController.getPayments);
router.post('/:id/payments', verifyToken, requireAdmin, paymentValidation, validate, billController.recordPayment);
router.delete('/:id/payments/:paymentId', verifyToken, requireAdmin, billController.deletePayment);

module.exports = router;
