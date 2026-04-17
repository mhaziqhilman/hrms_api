const express = require('express');
const router = express.Router();
const payRunController = require('../controllers/payRunController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireManager, requireAdmin } = require('../middleware/rbac.middleware');
const { query, param, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }
  next();
};

/**
 * @route   GET /api/payruns
 * @desc    Get all pay runs for company
 * @access  Private (Manager+)
 */
router.get(
  '/',
  verifyToken,
  requireManager,
  [
    query('year').optional().isInt({ min: 2020, max: 2100 }),
    query('status').optional().isIn(['Draft', 'Pending', 'Approved', 'Paid', 'Cancelled'])
  ],
  validate,
  payRunController.getPayRuns
);

/**
 * @route   GET /api/payruns/:id
 * @desc    Get single pay run with payrolls
 * @access  Private (Manager+)
 */
router.get(
  '/:id',
  verifyToken,
  requireManager,
  [param('id').notEmpty()],
  validate,
  payRunController.getPayRunById
);

/**
 * @route   DELETE /api/payruns/:id
 * @desc    Delete or cancel a pay run (cascades to linked payrolls)
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  verifyToken,
  requireAdmin,
  [param('id').notEmpty()],
  validate,
  payRunController.deletePayRun
);

module.exports = router;
