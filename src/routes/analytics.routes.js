const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireManager } = require('../middleware/rbac.middleware');
const { query, validationResult } = require('express-validator');

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

// Common validation rules
const yearValidation = [
  query('year').isInt({ min: 2020, max: 2100 }).withMessage('Year must be a valid integer between 2020 and 2100')
];

const periodValidation = [
  query('year').isInt({ min: 2020, max: 2100 }).withMessage('Year must be a valid integer between 2020 and 2100'),
  query('start_month').optional().isInt({ min: 1, max: 12 }).withMessage('Start month must be between 1 and 12'),
  query('end_month').optional().isInt({ min: 1, max: 12 }).withMessage('End month must be between 1 and 12')
];

const attendanceValidation = [
  query('year').isInt({ min: 2020, max: 2100 }).withMessage('Year must be a valid integer between 2020 and 2100'),
  query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12')
];

const dashboardValidation = [
  query('year').isInt({ min: 2020, max: 2100 }).withMessage('Year must be a valid integer between 2020 and 2100'),
  query('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12')
];

const exportValidation = [
  query('type').isIn(['payroll', 'leave', 'attendance', 'claims']).withMessage('Type must be one of: payroll, leave, attendance, claims'),
  query('year').isInt({ min: 2020, max: 2100 }).withMessage('Year must be a valid integer between 2020 and 2100'),
  query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12')
];

/**
 * @route   GET /api/analytics/payroll-cost
 * @desc    Get payroll cost analytics
 * @access  Private (Admin, Manager)
 */
router.get(
  '/payroll-cost',
  verifyToken,
  requireManager,
  periodValidation,
  validate,
  analyticsController.getPayrollCostAnalytics
);

/**
 * @route   GET /api/analytics/leave-utilization
 * @desc    Get leave utilization analytics
 * @access  Private (Admin, Manager)
 */
router.get(
  '/leave-utilization',
  verifyToken,
  requireManager,
  yearValidation,
  validate,
  analyticsController.getLeaveUtilizationAnalytics
);

/**
 * @route   GET /api/analytics/attendance-punctuality
 * @desc    Get attendance punctuality analytics
 * @access  Private (Admin, Manager)
 */
router.get(
  '/attendance-punctuality',
  verifyToken,
  requireManager,
  attendanceValidation,
  validate,
  analyticsController.getAttendancePunctualityAnalytics
);

/**
 * @route   GET /api/analytics/claims-spending
 * @desc    Get claims spending analytics
 * @access  Private (Admin, Manager)
 */
router.get(
  '/claims-spending',
  verifyToken,
  requireManager,
  yearValidation,
  validate,
  analyticsController.getClaimsSpendingAnalytics
);

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get dashboard summary
 * @access  Private (Admin, Manager)
 */
router.get(
  '/dashboard',
  verifyToken,
  requireManager,
  dashboardValidation,
  validate,
  analyticsController.getDashboardSummary
);

/**
 * @route   GET /api/analytics/export/excel
 * @desc    Export analytics data as Excel
 * @access  Private (Admin, Manager)
 */
router.get(
  '/export/excel',
  verifyToken,
  requireManager,
  exportValidation,
  validate,
  analyticsController.exportAnalyticsExcel
);

/**
 * @route   GET /api/analytics/export/pdf
 * @desc    Export analytics data as PDF
 * @access  Private (Admin, Manager)
 */
router.get(
  '/export/pdf',
  verifyToken,
  requireManager,
  exportValidation,
  validate,
  analyticsController.exportAnalyticsPDF
);

module.exports = router;
