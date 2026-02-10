const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireManager } = require('../middleware/rbac.middleware');

/**
 * @route   GET /api/dashboard/admin
 * @desc    Get admin dashboard data (organization-wide)
 * @access  Private (Admin, Super Admin)
 */
router.get(
  '/admin',
  verifyToken,
  requireAdmin,
  dashboardController.getAdminDashboard
);

/**
 * @route   GET /api/dashboard/manager
 * @desc    Get manager dashboard data (team-specific)
 * @access  Private (Manager, Admin, Super Admin)
 */
router.get(
  '/manager',
  verifyToken,
  requireManager,
  dashboardController.getManagerDashboard
);

/**
 * @route   GET /api/dashboard/staff
 * @desc    Get staff dashboard data (personal)
 * @access  Private (All authenticated users)
 */
router.get(
  '/staff',
  verifyToken,
  dashboardController.getStaffDashboard
);

module.exports = router;
