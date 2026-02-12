const express = require('express');
const { body } = require('express-validator');
const publicHolidayController = require('../controllers/publicHolidayController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

/**
 * @route   GET /api/public-holidays
 * @desc    Get all public holidays (with optional year filter)
 * @access  Private (All authenticated)
 */
router.get('/', verifyToken, publicHolidayController.getAllHolidays);

/**
 * @route   GET /api/public-holidays/:id
 * @desc    Get single public holiday
 * @access  Private (Admin)
 */
router.get('/:id', verifyToken, requireAdmin, publicHolidayController.getHoliday);

/**
 * @route   POST /api/public-holidays
 * @desc    Create public holiday
 * @access  Private (Admin)
 */
router.post(
  '/',
  verifyToken,
  requireAdmin,
  [
    body('name').notEmpty().withMessage('Holiday name is required'),
    body('date').isISO8601().withMessage('Valid date is required'),
    validate
  ],
  publicHolidayController.createHoliday
);

/**
 * @route   PUT /api/public-holidays/:id
 * @desc    Update public holiday
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  verifyToken,
  requireAdmin,
  [
    body('name').optional().notEmpty().withMessage('Holiday name cannot be empty'),
    body('date').optional().isISO8601().withMessage('Valid date is required'),
    validate
  ],
  publicHolidayController.updateHoliday
);

/**
 * @route   DELETE /api/public-holidays/:id
 * @desc    Delete public holiday
 * @access  Private (Admin)
 */
router.delete('/:id', verifyToken, requireAdmin, publicHolidayController.deleteHoliday);

module.exports = router;
