const dashboardService = require('../services/dashboardService');
const logger = require('../utils/logger');

/**
 * Get admin dashboard data
 * @route GET /api/dashboard/admin
 * @access Private (Admin, Super Admin)
 */
exports.getAdminDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getAdminDashboard(req.user.company_id);

    logger.info('Admin dashboard data retrieved', { user_id: req.user.id });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching admin dashboard:', error);
    next(error);
  }
};

/**
 * Get manager dashboard data
 * @route GET /api/dashboard/manager
 * @access Private (Manager, Admin, Super Admin)
 */
exports.getManagerDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getManagerDashboard(req.user.company_id, req.user.id);

    logger.info('Manager dashboard data retrieved', { user_id: req.user.id });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching manager dashboard:', error);
    next(error);
  }
};

/**
 * Get staff dashboard data
 * @route GET /api/dashboard/staff
 * @access Private (All authenticated users)
 */
exports.getStaffDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getStaffDashboard(req.user.company_id, req.user.id);

    logger.info('Staff dashboard data retrieved', { user_id: req.user.id });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching staff dashboard:', error);
    next(error);
  }
};
