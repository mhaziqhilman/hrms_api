const { Op } = require('sequelize');
const { User, Employee } = require('../models');

/**
 * Get all users with pagination, search, and filtering
 */
const getUsers = async ({ page = 1, limit = 10, search, role, is_active }) => {
  const offset = (page - 1) * limit;
  const where = {};

  if (search) {
    where.email = { [Op.like]: `%${search}%` };
  }

  if (role) {
    where.role = role;
  }

  if (is_active !== undefined && is_active !== '') {
    where.is_active = is_active === 'true' || is_active === true;
  }

  const { count, rows: users } = await User.findAndCountAll({
    where,
    include: [
      {
        model: Employee,
        as: 'employee',
        attributes: ['id', 'employee_id', 'full_name', 'position', 'department', 'employment_status']
      }
    ],
    attributes: { exclude: ['password', 'remember_token'] },
    order: [['created_at', 'DESC']],
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  return {
    users,
    pagination: {
      total: count,
      currentPage: parseInt(page),
      totalPages: Math.ceil(count / limit),
      limit: parseInt(limit)
    }
  };
};

/**
 * Get a single user by ID
 */
const getUserById = async (userId) => {
  const user = await User.findByPk(userId, {
    include: [
      {
        model: Employee,
        as: 'employee',
        attributes: ['id', 'employee_id', 'full_name', 'position', 'department', 'employment_status', 'email', 'mobile']
      }
    ],
    attributes: { exclude: ['password', 'remember_token'] }
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
};

/**
 * Update user role
 */
const updateUserRole = async (userId, newRole) => {
  const validRoles = ['super_admin', 'admin', 'manager', 'staff'];
  if (!validRoles.includes(newRole)) {
    throw new Error('Invalid role. Must be one of: ' + validRoles.join(', '));
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new Error('User not found');
  }

  user.role = newRole;
  await user.save();

  return user.toJSON();
};

/**
 * Activate or deactivate a user
 */
const toggleUserActive = async (userId, isActive) => {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new Error('User not found');
  }

  user.is_active = isActive;
  if (isActive) {
    // Reset failed login attempts and unlock when activating
    user.failed_login_attempts = 0;
    user.locked_until = null;
  }
  await user.save();

  return user.toJSON();
};

/**
 * Link a user to an employee record
 */
const linkUserToEmployee = async (userId, employeeId) => {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const employee = await Employee.findByPk(employeeId);
  if (!employee) {
    throw new Error('Employee not found');
  }

  // Check if employee is already linked to another user
  if (employee.user_id && employee.user_id !== userId) {
    throw new Error('This employee is already linked to another user account');
  }

  // Check if user is already linked to another employee
  const existingLink = await Employee.findOne({ where: { user_id: userId } });
  if (existingLink && existingLink.id !== employeeId) {
    throw new Error('This user is already linked to another employee record');
  }

  employee.user_id = userId;
  await employee.save();

  // Re-fetch with associations
  return await getUserById(userId);
};

/**
 * Unlink a user from their employee record
 */
const unlinkUserFromEmployee = async (userId) => {
  const employee = await Employee.findOne({ where: { user_id: userId } });
  if (!employee) {
    throw new Error('No employee record linked to this user');
  }

  employee.user_id = null;
  await employee.save();

  return await getUserById(userId);
};

/**
 * Get unlinked employees (employees without a user account)
 */
const getUnlinkedEmployees = async () => {
  const employees = await Employee.findAll({
    where: {
      user_id: null,
      employment_status: 'Active'
    },
    attributes: ['id', 'employee_id', 'full_name', 'position', 'department', 'email'],
    order: [['full_name', 'ASC']]
  });

  return employees;
};

/**
 * Reset user password (admin action)
 */
const resetUserPassword = async (userId, newPassword) => {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new Error('User not found');
  }

  user.password = newPassword; // Will be hashed by beforeUpdate hook
  user.failed_login_attempts = 0;
  user.locked_until = null;
  await user.save();

  return { message: 'Password reset successfully' };
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
