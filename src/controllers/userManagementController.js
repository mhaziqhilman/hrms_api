const userManagementService = require('../services/userManagementService');
const logger = require('../utils/logger');

/**
 * GET /api/users
 * Get all users with pagination
 */
const getUsers = async (req, res) => {
  try {
    const { page, limit, search, role, is_active } = req.query;
    const result = await userManagementService.getUsers({ page, limit, search, role, is_active });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

/**
 * GET /api/users/:id
 * Get single user by ID
 */
const getUserById = async (req, res) => {
  try {
    const user = await userManagementService.getUserById(req.params.id);

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    logger.error('Error fetching user:', error);
    const status = error.message === 'User not found' ? 404 : 500;
    res.status(status).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * PUT /api/users/:id/role
 * Update user role
 */
const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const user = await userManagementService.updateUserRole(req.params.id, role);

    res.json({
      success: true,
      message: 'User role updated successfully',
      data: user
    });
  } catch (error) {
    logger.error('Error updating user role:', error);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * PUT /api/users/:id/toggle-active
 * Activate or deactivate a user
 */
const toggleUserActive = async (req, res) => {
  try {
    const { is_active } = req.body;
    const user = await userManagementService.toggleUserActive(req.params.id, is_active);

    res.json({
      success: true,
      message: is_active ? 'User activated successfully' : 'User deactivated successfully',
      data: user
    });
  } catch (error) {
    logger.error('Error toggling user status:', error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * PUT /api/users/:id/link-employee
 * Link a user to an employee record
 */
const linkUserToEmployee = async (req, res) => {
  try {
    const { employee_id } = req.body;
    const user = await userManagementService.linkUserToEmployee(req.params.id, employee_id);

    res.json({
      success: true,
      message: 'User linked to employee successfully',
      data: user
    });
  } catch (error) {
    logger.error('Error linking user to employee:', error);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * PUT /api/users/:id/unlink-employee
 * Unlink a user from their employee record
 */
const unlinkUserFromEmployee = async (req, res) => {
  try {
    const user = await userManagementService.unlinkUserFromEmployee(req.params.id);

    res.json({
      success: true,
      message: 'User unlinked from employee successfully',
      data: user
    });
  } catch (error) {
    logger.error('Error unlinking user from employee:', error);
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * GET /api/users/unlinked-employees
 * Get employees without a user account
 */
const getUnlinkedEmployees = async (req, res) => {
  try {
    const employees = await userManagementService.getUnlinkedEmployees();

    res.json({
      success: true,
      data: employees
    });
  } catch (error) {
    logger.error('Error fetching unlinked employees:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unlinked employees',
      error: error.message
    });
  }
};

/**
 * PUT /api/users/:id/reset-password
 * Admin reset of user password
 */
const resetUserPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters'
      });
    }

    const result = await userManagementService.resetUserPassword(req.params.id, password);

    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    logger.error('Error resetting user password:', error);
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateUserRole,
  toggleUserActive,
  linkUserToEmployee,
  unlinkUserFromEmployee,
  getUnlinkedEmployees,
  resetUserPassword
};
