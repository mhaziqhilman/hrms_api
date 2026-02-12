const express = require('express');
const router = express.Router();
const userManagementController = require('../controllers/userManagementController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const { body, query, param } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');

// Role-based access: most routes allow super_admin + admin
const requireSuperAdmin = requireRole(['super_admin']);
const requireAdminAccess = requireRole(['super_admin', 'admin']);

/**
 * @route   GET /api/users/unlinked-employees
 * @desc    Get employees without user accounts (must be before /:id)
 * @access  Super Admin + Admin
 */
router.get(
  '/unlinked-employees',
  verifyToken,
  requireAdminAccess,
  userManagementController.getUnlinkedEmployees
);

/**
 * @route   GET /api/users
 * @desc    Get all users with pagination and filtering
 * @access  Super Admin + Admin
 */
router.get(
  '/',
  verifyToken,
  requireAdminAccess,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('role').optional().isIn(['super_admin', 'admin', 'manager', 'staff']).withMessage('Invalid role'),
    query('is_active').optional().isIn(['true', 'false']).withMessage('is_active must be true or false'),
    query('company_id').optional().isInt({ min: 1 }).withMessage('Company ID must be a positive integer'),
    validate
  ],
  userManagementController.getUsers
);

/**
 * @route   GET /api/users/:id
 * @desc    Get single user by ID
 * @access  Super Admin + Admin
 */
router.get(
  '/:id',
  verifyToken,
  requireAdminAccess,
  [
    param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    validate
  ],
  userManagementController.getUserById
);

/**
 * @route   PUT /api/users/:id/role
 * @desc    Update user role
 * @access  Super Admin only
 */
router.put(
  '/:id/role',
  verifyToken,
  requireSuperAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('role').notEmpty().withMessage('Role is required')
      .isIn(['super_admin', 'admin', 'manager', 'staff']).withMessage('Invalid role'),
    validate
  ],
  userManagementController.updateUserRole
);

/**
 * @route   PUT /api/users/:id/toggle-active
 * @desc    Activate or deactivate a user
 * @access  Super Admin + Admin
 */
router.put(
  '/:id/toggle-active',
  verifyToken,
  requireAdminAccess,
  [
    param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('is_active').isBoolean().withMessage('is_active must be a boolean'),
    validate
  ],
  userManagementController.toggleUserActive
);

/**
 * @route   PUT /api/users/:id/link-employee
 * @desc    Link user to an employee record
 * @access  Super Admin + Admin
 */
router.put(
  '/:id/link-employee',
  verifyToken,
  requireAdminAccess,
  [
    param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('employee_id').notEmpty().withMessage('Employee ID is required')
      .isInt({ min: 1 }).withMessage('Employee ID must be a positive integer'),
    validate
  ],
  userManagementController.linkUserToEmployee
);

/**
 * @route   PUT /api/users/:id/unlink-employee
 * @desc    Unlink user from employee record
 * @access  Super Admin + Admin
 */
router.put(
  '/:id/unlink-employee',
  verifyToken,
  requireAdminAccess,
  [
    param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    validate
  ],
  userManagementController.unlinkUserFromEmployee
);

/**
 * @route   PUT /api/users/:id/reset-password
 * @desc    Admin reset of user password
 * @access  Super Admin + Admin
 */
router.put(
  '/:id/reset-password',
  verifyToken,
  requireAdminAccess,
  [
    param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('password').notEmpty().withMessage('Password is required')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    validate
  ],
  userManagementController.resetUserPassword
);

module.exports = router;
