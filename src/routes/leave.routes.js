const express = require('express');
const router = express.Router();
const leaveController = require('../controllers/leaveController');
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
const applyLeaveValidation = [
  body('employee_id').isInt().withMessage('Employee ID must be an integer'),
  body('leave_type_id').isInt().withMessage('Leave type ID must be an integer'),
  body('start_date').isISO8601().withMessage('Start date must be a valid date'),
  body('end_date').isISO8601().withMessage('End date must be a valid date'),
  body('is_half_day').optional().isBoolean().withMessage('is_half_day must be a boolean'),
  body('half_day_period').optional().isIn(['AM', 'PM']).withMessage('half_day_period must be AM or PM'),
  body('reason').notEmpty().withMessage('Reason is required'),
  body('attachment_url').optional().isURL().withMessage('Attachment URL must be valid')
];

const updateLeaveValidation = [
  param('id').isInt().withMessage('Leave ID must be an integer'),
  body('start_date').optional().isISO8601().withMessage('Start date must be a valid date'),
  body('end_date').optional().isISO8601().withMessage('End date must be a valid date'),
  body('is_half_day').optional().isBoolean().withMessage('is_half_day must be a boolean'),
  body('half_day_period').optional().isIn(['AM', 'PM']).withMessage('half_day_period must be AM or PM'),
  body('reason').optional().notEmpty().withMessage('Reason cannot be empty'),
  body('attachment_url').optional().isURL().withMessage('Attachment URL must be valid')
];

const approveRejectValidation = [
  param('id').isInt().withMessage('Leave ID must be an integer'),
  body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
  body('rejection_reason').optional().notEmpty().withMessage('Rejection reason cannot be empty')
];

const idParamValidation = [
  param('id').isInt().withMessage('ID must be an integer')
];

const queryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['Pending', 'Approved', 'Rejected', 'Cancelled']).withMessage('Invalid status'),
  query('employee_id').optional().isInt().withMessage('Employee ID must be an integer'),
  query('leave_type_id').optional().isInt().withMessage('Leave type ID must be an integer'),
  query('start_date').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('end_date').optional().isISO8601().withMessage('End date must be a valid date')
];

/**
 * @route   GET /api/leaves
 * @desc    Get all leave applications with pagination and filtering
 * @access  Private (Admin, Manager, Staff - own records only)
 */
router.get(
  '/',
  verifyToken,
  queryValidation,
  validate,
  leaveController.getAllLeaves
);

/**
 * @route   GET /api/leaves/:id
 * @desc    Get single leave application by ID
 * @access  Private (Admin, Manager, Staff - own record only)
 */
router.get(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  leaveController.getLeaveById
);

/**
 * @route   POST /api/leaves
 * @desc    Apply for leave
 * @access  Private (All authenticated users)
 */
router.post(
  '/',
  verifyToken,
  applyLeaveValidation,
  validate,
  leaveController.applyLeave
);

/**
 * @route   PUT /api/leaves/:id
 * @desc    Update leave application (only pending leaves)
 * @access  Private (Admin, Manager, Staff - own record only)
 */
router.put(
  '/:id',
  verifyToken,
  updateLeaveValidation,
  validate,
  leaveController.updateLeave
);

/**
 * @route   PATCH /api/leaves/:id/approve-reject
 * @desc    Approve or reject leave application
 * @access  Private (Admin, Manager)
 */
router.patch(
  '/:id/approve-reject',
  verifyToken,
  requireManager,
  approveRejectValidation,
  validate,
  leaveController.approveRejectLeave
);

/**
 * @route   DELETE /api/leaves/:id
 * @desc    Cancel leave application
 * @access  Private (Admin, Staff - own record only)
 */
router.delete(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  leaveController.cancelLeave
);

/**
 * @route   GET /api/leaves/balance/:employee_id
 * @desc    Get leave balance for an employee
 * @access  Private (Admin, Manager, Staff - own balance only)
 */
router.get(
  '/balance/:employee_id',
  verifyToken,
  [
    param('employee_id').isInt().withMessage('Employee ID must be an integer'),
    query('year').optional().isInt({ min: 2020, max: 2100 }).withMessage('Invalid year')
  ],
  validate,
  leaveController.getLeaveBalance
);

module.exports = router;
