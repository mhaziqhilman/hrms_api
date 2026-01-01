const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
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
const clockInValidation = [
  body('employee_id').isInt().withMessage('Employee ID must be an integer'),
  body('type').optional().isIn(['Office', 'WFH']).withMessage('Type must be Office or WFH'),
  body('location_lat').optional().isDecimal().withMessage('Latitude must be a valid decimal'),
  body('location_long').optional().isDecimal().withMessage('Longitude must be a valid decimal'),
  body('location_address').optional().isString().withMessage('Location address must be a string')
];

const clockOutValidation = [
  body('employee_id').isInt().withMessage('Employee ID must be an integer'),
  body('location_lat').optional().isDecimal().withMessage('Latitude must be a valid decimal'),
  body('location_long').optional().isDecimal().withMessage('Longitude must be a valid decimal'),
  body('location_address').optional().isString().withMessage('Location address must be a string')
];

const updateAttendanceValidation = [
  param('id').isInt().withMessage('Attendance ID must be an integer'),
  body('clock_in_time').optional().isISO8601().withMessage('Clock in time must be a valid datetime'),
  body('clock_out_time').optional().isISO8601().withMessage('Clock out time must be a valid datetime'),
  body('type').optional().isIn(['Office', 'WFH']).withMessage('Type must be Office or WFH'),
  body('remarks').optional().isString().withMessage('Remarks must be a string')
];

const applyWFHValidation = [
  body('employee_id').isInt().withMessage('Employee ID must be an integer'),
  body('date').isISO8601().withMessage('Date must be a valid date'),
  body('reason').notEmpty().withMessage('Reason is required')
];

const approveRejectWFHValidation = [
  param('id').isInt().withMessage('WFH application ID must be an integer'),
  body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
  body('rejection_reason').optional().notEmpty().withMessage('Rejection reason cannot be empty')
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
  query('type').optional().isIn(['Office', 'WFH']).withMessage('Type must be Office or WFH'),
  query('start_date').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('end_date').optional().isISO8601().withMessage('End date must be a valid date'),
  query('is_late').optional().isBoolean().withMessage('is_late must be a boolean'),
  query('is_early_leave').optional().isBoolean().withMessage('is_early_leave must be a boolean')
];

const wfhQueryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['Pending', 'Approved', 'Rejected']).withMessage('Invalid status'),
  query('employee_id').optional().isInt().withMessage('Employee ID must be an integer'),
  query('start_date').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('end_date').optional().isISO8601().withMessage('End date must be a valid date')
];

const summaryQueryValidation = [
  param('employee_id').isInt().withMessage('Employee ID must be an integer'),
  query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  query('year').optional().isInt({ min: 2020, max: 2100 }).withMessage('Invalid year')
];

/**
 * @route   POST /api/attendance/clock-in
 * @desc    Clock in
 * @access  Private (All authenticated users)
 */
router.post(
  '/clock-in',
  verifyToken,
  clockInValidation,
  validate,
  attendanceController.clockIn
);

/**
 * @route   POST /api/attendance/clock-out
 * @desc    Clock out
 * @access  Private (All authenticated users)
 */
router.post(
  '/clock-out',
  verifyToken,
  clockOutValidation,
  validate,
  attendanceController.clockOut
);

/**
 * @route   GET /api/attendance/summary/:employee_id
 * @desc    Get attendance summary for an employee
 * @access  Private (Admin, Manager, Staff - own summary only)
 * NOTE: Must come before /:id to avoid route conflict
 */
router.get(
  '/summary/:employee_id',
  verifyToken,
  summaryQueryValidation,
  validate,
  attendanceController.getAttendanceSummary
);

/**
 * @route   POST /api/attendance/wfh
 * @desc    Apply for Work From Home
 * @access  Private (All authenticated users)
 * NOTE: Must come before /:id to avoid route conflict
 */
router.post(
  '/wfh',
  verifyToken,
  applyWFHValidation,
  validate,
  attendanceController.applyWFH
);

/**
 * @route   GET /api/attendance/wfh
 * @desc    Get all WFH applications with pagination and filtering
 * @access  Private (Admin, Manager, Staff - own records only)
 * NOTE: Must come before /:id to avoid route conflict
 */
router.get(
  '/wfh',
  verifyToken,
  wfhQueryValidation,
  validate,
  attendanceController.getAllWFH
);

/**
 * @route   PATCH /api/attendance/wfh/:id/approve-reject
 * @desc    Approve or reject WFH application
 * @access  Private (Admin, Manager)
 * NOTE: Must come before /:id to avoid route conflict
 */
router.patch(
  '/wfh/:id/approve-reject',
  verifyToken,
  requireManager,
  approveRejectWFHValidation,
  validate,
  attendanceController.approveRejectWFH
);

/**
 * @route   GET /api/attendance
 * @desc    Get all attendance records with pagination and filtering
 * @access  Private (Admin, Manager, Staff - own records only)
 */
router.get(
  '/',
  verifyToken,
  queryValidation,
  validate,
  attendanceController.getAllAttendance
);

/**
 * @route   GET /api/attendance/:id
 * @desc    Get single attendance record by ID
 * @access  Private (Admin, Manager, Staff - own record only)
 * NOTE: This route must come AFTER specific routes like /wfh, /summary to avoid conflicts
 */
router.get(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  attendanceController.getAttendanceById
);

/**
 * @route   PUT /api/attendance/:id
 * @desc    Update attendance record (manual adjustment)
 * @access  Private (Admin, Manager)
 */
router.put(
  '/:id',
  verifyToken,
  requireManager,
  updateAttendanceValidation,
  validate,
  attendanceController.updateAttendance
);

/**
 * @route   DELETE /api/attendance/:id
 * @desc    Delete attendance record
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  verifyToken,
  requireAdmin,
  idParamValidation,
  validate,
  attendanceController.deleteAttendance
);

module.exports = router;
