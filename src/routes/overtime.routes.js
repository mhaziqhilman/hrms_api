const express = require('express');
const router = express.Router();
const overtimeController = require('../controllers/overtimeController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireManager } = require('../middleware/rbac.middleware');
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

const dayTypes = ['normal', 'rest_day', 'public_holiday'];

const submitValidation = [
  body('employee_id').optional({ nullable: true }).notEmpty().withMessage('Employee ID cannot be empty'),
  body('date').isISO8601().withMessage('Date must be a valid date'),
  body('hours').isFloat({ gt: 0 }).withMessage('Hours must be a positive number'),
  body('day_type').optional().isIn(dayTypes).withMessage('Invalid day type'),
  body('reason').optional().isString(),
  body('source').optional().isIn(['manual', 'attendance']).withMessage('Invalid source'),
  body('start_time').optional({ nullable: true }).isString(),
  body('end_time').optional({ nullable: true }).isString()
];

const updateValidation = [
  param('id').notEmpty().withMessage('ID is required'),
  body('date').optional().isISO8601().withMessage('Date must be a valid date'),
  body('hours').optional().isFloat({ gt: 0 }).withMessage('Hours must be a positive number'),
  body('day_type').optional().isIn(dayTypes).withMessage('Invalid day type'),
  body('reason').optional().isString()
];

const approvalValidation = [
  param('id').notEmpty().withMessage('ID is required'),
  body('action').isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
  body('rejection_reason').if(body('action').equals('reject')).notEmpty().withMessage('Rejection reason is required when rejecting')
];

const idParamValidation = [param('id').notEmpty().withMessage('ID is required')];

// Form helpers
router.get('/suggest-day-type', verifyToken, overtimeController.suggestDayType);
router.get('/suggest-from-attendance', verifyToken, overtimeController.suggestFromAttendance);
router.get('/approved-total', verifyToken, overtimeController.getApprovedTotal);

// Manager/admin: team pending requests
router.get('/team', verifyToken, requireManager, overtimeController.getTeamOvertime);

// List (role-scoped) + submit
router.get('/', verifyToken, overtimeController.getAllOvertime);
router.post('/', verifyToken, submitValidation, validate, overtimeController.submitOvertime);

// Single record CRUD
router.get('/:id', verifyToken, idParamValidation, validate, overtimeController.getOvertimeById);
router.put('/:id', verifyToken, updateValidation, validate, overtimeController.updateOvertime);
router.delete('/:id', verifyToken, idParamValidation, validate, overtimeController.deleteOvertime);

// Manager approval/rejection
router.patch('/:id/approval', verifyToken, requireManager, approvalValidation, validate, overtimeController.managerApproval);

module.exports = router;
