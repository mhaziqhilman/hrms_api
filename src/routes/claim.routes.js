const express = require('express');
const router = express.Router();
const claimController = require('../controllers/claimController');
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

// Validation rules
const submitClaimValidation = [
  body('employee_id').isInt().withMessage('Employee ID must be an integer'),
  body('claim_type_id').isInt().withMessage('Claim type ID must be an integer'),
  body('date').isISO8601().withMessage('Date must be a valid date'),
  body('amount').isDecimal({ min: 0.01 }).withMessage('Amount must be a positive decimal'),
  body('description').notEmpty().withMessage('Description is required'),
  body('receipt_url').optional().isURL().withMessage('Receipt URL must be a valid URL')
];

const updateClaimValidation = [
  param('id').isInt().withMessage('Claim ID must be an integer'),
  body('claim_type_id').optional().isInt().withMessage('Claim type ID must be an integer'),
  body('date').optional().isISO8601().withMessage('Date must be a valid date'),
  body('amount').optional().isDecimal({ min: 0.01 }).withMessage('Amount must be a positive decimal'),
  body('description').optional().notEmpty().withMessage('Description cannot be empty'),
  body('receipt_url').optional().isURL().withMessage('Receipt URL must be a valid URL')
];

const managerApprovalValidation = [
  param('id').isInt().withMessage('Claim ID must be an integer'),
  body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
  body('rejection_reason').if(body('action').equals('reject')).notEmpty().withMessage('Rejection reason is required when rejecting')
];

const financeApprovalValidation = [
  param('id').isInt().withMessage('Claim ID must be an integer'),
  body('action').isIn(['approve', 'reject', 'paid']).withMessage('Action must be approve, reject, or paid'),
  body('rejection_reason').if(body('action').equals('reject')).notEmpty().withMessage('Rejection reason is required when rejecting'),
  body('payment_date').if(body('action').equals('paid')).optional().isISO8601().withMessage('Payment date must be a valid date'),
  body('payment_method').if(body('action').equals('paid')).optional().isIn(['Bank Transfer', 'Cash', 'Cheque']).withMessage('Invalid payment method'),
  body('payment_reference').if(body('action').equals('paid')).optional().isString().withMessage('Payment reference must be a string')
];

const idParamValidation = [
  param('id').isInt().withMessage('ID must be an integer')
];

const employeeIdParamValidation = [
  param('employee_id').isInt().withMessage('Employee ID must be an integer')
];

const queryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('employee_id').optional().isInt().withMessage('Employee ID must be an integer'),
  query('claim_type_id').optional().isInt().withMessage('Claim type ID must be an integer'),
  query('status').optional().isIn(['Pending', 'Manager_Approved', 'Finance_Approved', 'Rejected', 'Paid']).withMessage('Invalid status'),
  query('start_date').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('end_date').optional().isISO8601().withMessage('End date must be a valid date')
];

const summaryQueryValidation = [
  param('employee_id').isInt().withMessage('Employee ID must be an integer'),
  query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  query('year').optional().isInt({ min: 2020, max: 2100 }).withMessage('Invalid year')
];

/**
 * @route   POST /api/claims
 * @desc    Submit a new claim
 * @access  Private (All authenticated users)
 */
router.post(
  '/',
  verifyToken,
  submitClaimValidation,
  validate,
  claimController.submitClaim
);

/**
 * @route   GET /api/claims
 * @desc    Get all claims with pagination and filtering
 * @access  Private (Admin, Manager - all claims; Staff - own claims only)
 */
router.get(
  '/',
  verifyToken,
  queryValidation,
  validate,
  claimController.getAllClaims
);

/**
 * @route   GET /api/claims/:id
 * @desc    Get single claim by ID
 * @access  Private (Admin, Manager - any claim; Staff - own claim only)
 */
router.get(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  claimController.getClaimById
);

/**
 * @route   PUT /api/claims/:id
 * @desc    Update claim (only pending claims)
 * @access  Private (Admin, Manager - any claim; Staff - own pending claim only)
 */
router.put(
  '/:id',
  verifyToken,
  updateClaimValidation,
  validate,
  claimController.updateClaim
);

/**
 * @route   DELETE /api/claims/:id
 * @desc    Delete claim
 * @access  Private (Admin - any claim; Staff - own pending claim only)
 */
router.delete(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  claimController.deleteClaim
);

/**
 * @route   PATCH /api/claims/:id/manager-approval
 * @desc    Manager approve or reject claim
 * @access  Private (Manager, Admin)
 */
router.patch(
  '/:id/manager-approval',
  verifyToken,
  requireManager,
  managerApprovalValidation,
  validate,
  claimController.managerApproval
);

/**
 * @route   PATCH /api/claims/:id/finance-approval
 * @desc    Finance approve, reject, or mark claim as paid
 * @access  Private (Admin only - finance role)
 */
router.patch(
  '/:id/finance-approval',
  verifyToken,
  requireAdmin,
  financeApprovalValidation,
  validate,
  claimController.financeApproval
);

/**
 * @route   GET /api/claims/summary/:employee_id
 * @desc    Get claims summary for an employee
 * @access  Private (Admin, Manager - any employee; Staff - own summary only)
 */
router.get(
  '/summary/:employee_id',
  verifyToken,
  summaryQueryValidation,
  validate,
  claimController.getClaimsSummary
);

module.exports = router;
