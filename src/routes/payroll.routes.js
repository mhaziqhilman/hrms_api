const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole, requireAdmin, requireManager } = require('../middleware/rbac.middleware');
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
const calculatePayrollValidation = [
  body('employee_id').isInt().withMessage('Employee ID must be an integer'),
  body('year').isInt({ min: 2020, max: 2100 }).withMessage('Year must be a valid integer'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  body('allowances').optional().isFloat({ min: 0 }).withMessage('Allowances must be a positive number'),
  body('overtime_pay').optional().isFloat({ min: 0 }).withMessage('Overtime pay must be a positive number'),
  body('bonus').optional().isFloat({ min: 0 }).withMessage('Bonus must be a positive number'),
  body('commission').optional().isFloat({ min: 0 }).withMessage('Commission must be a positive number'),
  body('unpaid_leave_deduction').optional().isFloat({ min: 0 }).withMessage('Unpaid leave deduction must be a positive number'),
  body('other_deductions').optional().isFloat({ min: 0 }).withMessage('Other deductions must be a positive number'),
  body('payment_date').optional().isISO8601().withMessage('Payment date must be a valid date'),
  body('notes').optional().isString().withMessage('Notes must be a string')
];

const updatePayrollValidation = [
  param('id').isInt().withMessage('Payroll ID must be an integer'),
  body('allowances').optional().isFloat({ min: 0 }).withMessage('Allowances must be a positive number'),
  body('overtime_pay').optional().isFloat({ min: 0 }).withMessage('Overtime pay must be a positive number'),
  body('bonus').optional().isFloat({ min: 0 }).withMessage('Bonus must be a positive number'),
  body('commission').optional().isFloat({ min: 0 }).withMessage('Commission must be a positive number'),
  body('unpaid_leave_deduction').optional().isFloat({ min: 0 }).withMessage('Unpaid leave deduction must be a positive number'),
  body('other_deductions').optional().isFloat({ min: 0 }).withMessage('Other deductions must be a positive number'),
  body('payment_date').optional().isISO8601().withMessage('Payment date must be a valid date'),
  body('notes').optional().isString().withMessage('Notes must be a string'),
  body('status').optional().isIn(['Draft', 'Pending', 'Approved', 'Paid', 'Cancelled']).withMessage('Invalid status')
];

const idParamValidation = [
  param('id').isInt().withMessage('ID must be an integer')
];

const queryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['Draft', 'Pending', 'Approved', 'Paid', 'Cancelled']).withMessage('Invalid status'),
  query('year').optional().isInt({ min: 2020, max: 2100 }).withMessage('Invalid year'),
  query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  query('employee_id').optional().isInt().withMessage('Employee ID must be an integer')
];

/**
 * @route   GET /api/payroll
 * @desc    Get all payroll records with pagination and filtering
 * @access  Private (Admin, Manager)
 */
router.get(
  '/',
  verifyToken,
  requireManager,
  queryValidation,
  validate,
  payrollController.getAllPayroll
);

/**
 * @route   GET /api/payroll/my-payslips
 * @desc    Get current user's payslips
 * @access  Private (All authenticated users)
 */
router.get(
  '/my-payslips',
  verifyToken,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('year').optional().isInt({ min: 2020, max: 2100 }).withMessage('Invalid year')
  ],
  validate,
  payrollController.getMyPayslips
);

/**
 * @route   GET /api/payroll/:id
 * @desc    Get single payroll record by ID
 * @access  Private (Admin, Manager, Staff - own records only)
 */
router.get(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  payrollController.getPayrollById
);

/**
 * @route   POST /api/payroll/calculate
 * @desc    Calculate and create payroll for an employee
 * @access  Private (Admin, Manager)
 */
router.post(
  '/calculate',
  verifyToken,
  requireManager,
  calculatePayrollValidation,
  validate,
  payrollController.calculatePayroll
);

/**
 * @route   PUT /api/payroll/:id
 * @desc    Update payroll record
 * @access  Private (Admin, Manager)
 */
router.put(
  '/:id',
  verifyToken,
  requireManager,
  updatePayrollValidation,
  validate,
  payrollController.updatePayroll
);

/**
 * @route   PATCH /api/payroll/:id/submit
 * @desc    Submit payroll for approval (Draft -> Pending)
 * @access  Private (Manager)
 */
router.patch(
  '/:id/submit',
  verifyToken,
  requireManager,
  idParamValidation,
  validate,
  payrollController.submitForApproval
);

/**
 * @route   PATCH /api/payroll/:id/approve
 * @desc    Approve payroll (Pending -> Approved)
 * @access  Private (Admin)
 */
router.patch(
  '/:id/approve',
  verifyToken,
  requireAdmin,
  idParamValidation,
  validate,
  payrollController.approvePayroll
);

/**
 * @route   PATCH /api/payroll/:id/mark-paid
 * @desc    Mark payroll as paid
 * @access  Private (Admin)
 */
router.patch(
  '/:id/mark-paid',
  verifyToken,
  requireAdmin,
  idParamValidation,
  validate,
  payrollController.markAsPaid
);

/**
 * @route   DELETE /api/payroll/:id
 * @desc    Cancel payroll (soft delete)
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  verifyToken,
  requireAdmin,
  idParamValidation,
  validate,
  payrollController.deletePayroll
);

/**
 * @route   GET /api/payroll/:id/payslip
 * @desc    Generate payslip for a payroll record
 * @access  Private (Admin, Manager, Staff - own records only)
 */
router.get(
  '/:id/payslip',
  verifyToken,
  idParamValidation,
  validate,
  payrollController.generatePayslip
);

module.exports = router;
