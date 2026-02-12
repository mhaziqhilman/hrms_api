const express = require('express');
const { body } = require('express-validator');
const leaveTypeController = require('../controllers/leaveTypeController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

/**
 * @route   GET /api/leave-types
 * @desc    Get all leave types for user's company
 * @access  Private (All authenticated)
 */
router.get('/', verifyToken, leaveTypeController.getAllLeaveTypes);

/**
 * @route   GET /api/leave-types/:id
 * @desc    Get single leave type
 * @access  Private (Admin)
 */
router.get('/:id', verifyToken, requireAdmin, leaveTypeController.getLeaveType);

/**
 * @route   POST /api/leave-types
 * @desc    Create leave type
 * @access  Private (Admin)
 */
router.post(
  '/',
  verifyToken,
  requireAdmin,
  [
    body('name').notEmpty().withMessage('Leave type name is required'),
    body('days_per_year').optional().isInt({ min: 0 }).withMessage('Days per year must be a non-negative integer'),
    validate
  ],
  leaveTypeController.createLeaveType
);

/**
 * @route   PUT /api/leave-types/:id
 * @desc    Update leave type
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  verifyToken,
  requireAdmin,
  [
    body('name').optional().notEmpty().withMessage('Leave type name cannot be empty'),
    body('days_per_year').optional().isInt({ min: 0 }).withMessage('Days per year must be a non-negative integer'),
    validate
  ],
  leaveTypeController.updateLeaveType
);

/**
 * @route   PATCH /api/leave-types/:id/toggle
 * @desc    Toggle leave type active status
 * @access  Private (Admin)
 */
router.patch('/:id/toggle', verifyToken, requireAdmin, leaveTypeController.toggleLeaveType);

module.exports = router;
