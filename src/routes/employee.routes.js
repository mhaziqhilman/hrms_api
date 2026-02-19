const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireManager } = require('../middleware/rbac.middleware');
const { body, query, param } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');

/**
 * Employee validation rules
 */
const createEmployeeValidation = [
  body('employee_id')
    .notEmpty().withMessage('Employee ID is required')
    .isLength({ max: 20 }).withMessage('Employee ID must not exceed 20 characters'),
  body('full_name')
    .notEmpty().withMessage('Full name is required')
    .isLength({ max: 150 }).withMessage('Full name must not exceed 150 characters'),
  body('ic_no')
    .optional()
    .matches(/^\d{12}$/).withMessage('IC number must be 12 digits'),
  body('gender')
    .notEmpty().withMessage('Gender is required')
    .isIn(['Male', 'Female']).withMessage('Gender must be Male or Female'),
  body('basic_salary')
    .notEmpty().withMessage('Basic salary is required')
    .isDecimal().withMessage('Basic salary must be a valid decimal'),
  body('join_date')
    .notEmpty().withMessage('Join date is required')
    .isISO8601().withMessage('Join date must be a valid date'),
  body('email')
    .optional()
    .isEmail().withMessage('Must be a valid email address'),
  body('employment_type')
    .optional()
    .isIn(['Permanent', 'Contract', 'Probation', 'Intern'])
    .withMessage('Invalid employment type')
];

const updateEmployeeValidation = [
  body('employee_id')
    .optional()
    .isLength({ max: 20 }).withMessage('Employee ID must not exceed 20 characters'),
  body('full_name')
    .optional()
    .isLength({ max: 150 }).withMessage('Full name must not exceed 150 characters'),
  body('ic_no')
    .optional()
    .matches(/^\d{12}$/).withMessage('IC number must be 12 digits'),
  body('gender')
    .optional()
    .isIn(['Male', 'Female']).withMessage('Gender must be Male or Female'),
  body('basic_salary')
    .optional()
    .isDecimal().withMessage('Basic salary must be a valid decimal'),
  body('join_date')
    .optional()
    .isISO8601().withMessage('Join date must be a valid date'),
  body('email')
    .optional()
    .isEmail().withMessage('Must be a valid email address'),
  body('employment_type')
    .optional()
    .isIn(['Permanent', 'Contract', 'Probation', 'Intern'])
    .withMessage('Invalid employment type'),
  body('employment_status')
    .optional()
    .isIn(['Active', 'Resigned', 'Terminated'])
    .withMessage('Invalid employment status')
];

const deleteEmployeeValidation = [
  body('status')
    .optional()
    .isIn(['Resigned', 'Terminated'])
    .withMessage('Status must be either Resigned or Terminated'),
  body('reason')
    .optional()
    .isString().withMessage('Reason must be a string')
];

/**
 * @route   GET /api/employees/statistics
 * @desc    Get employee statistics
 * @access  Admin, Manager
 */
router.get(
  '/statistics',
  verifyToken,
  requireManager,
  employeeController.getEmployeeStatistics
);

/**
 * @route   GET /api/employees/me
 * @desc    Get own employee profile
 * @access  Private (All authenticated users)
 */
router.get(
  '/me',
  verifyToken,
  employeeController.getOwnProfile
);

/**
 * @route   PUT /api/employees/me
 * @desc    Update own profile (limited fields)
 * @access  Private (All authenticated users)
 */
router.put(
  '/me',
  verifyToken,
  [
    body('mobile').optional().isString().withMessage('Mobile must be a string'),
    body('email').optional().isEmail().withMessage('Must be a valid email address'),
    body('current_address').optional().isString().withMessage('Current address must be a string'),
    body('permanent_address').optional().isString().withMessage('Permanent address must be a string'),
    body('emergency_contact_name').optional().isString().withMessage('Emergency contact name must be a string'),
    body('emergency_contact_phone').optional().isString().withMessage('Emergency contact phone must be a string'),
    body('photo_url').optional().isURL().withMessage('Photo URL must be a valid URL'),
    validate
  ],
  employeeController.updateOwnProfile
);

/**
 * @route   GET /api/employees
 * @desc    Get all employees with pagination and filtering
 * @access  Admin, Manager
 */
router.get(
  '/',
  verifyToken,
  requireManager,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['Active', 'Resigned', 'Terminated']).withMessage('Invalid status'),
    query('employment_type').optional().isIn(['Permanent', 'Contract', 'Probation', 'Intern']).withMessage('Invalid employment type'),
    validate
  ],
  employeeController.getAllEmployees
);

/**
 * @route   GET /api/employees/:id/ytd
 * @desc    Get employee YTD statutory summary
 * @access  Admin, Manager, Staff (own profile only)
 */
router.get(
  '/:id/ytd',
  verifyToken,
  [
    param('id').isInt({ min: 1 }).withMessage('Employee ID must be a positive integer'),
    query('year').optional().isInt({ min: 2000, max: 2100 }).withMessage('Invalid year'),
    validate
  ],
  employeeController.getEmployeeYTD
);

/**
 * @route   GET /api/employees/:id
 * @desc    Get employee by ID
 * @access  Admin, Manager, Staff (own profile only)
 */
router.get(
  '/:id',
  verifyToken,
  [
    param('id').isInt({ min: 1 }).withMessage('Employee ID must be a positive integer'),
    validate
  ],
  employeeController.getEmployeeById
);

/**
 * @route   POST /api/employees
 * @desc    Create new employee
 * @access  Admin only
 */
router.post(
  '/',
  verifyToken,
  requireAdmin,
  [...createEmployeeValidation, validate],
  employeeController.createEmployee
);

/**
 * @route   PUT /api/employees/:id
 * @desc    Update employee
 * @access  Admin only
 */
router.put(
  '/:id',
  verifyToken,
  requireAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Employee ID must be a positive integer'),
    ...updateEmployeeValidation,
    validate
  ],
  employeeController.updateEmployee
);

/**
 * @route   DELETE /api/employees/:id
 * @desc    Soft delete employee (change status to Resigned/Terminated)
 * @access  Admin only
 */
router.delete(
  '/:id',
  verifyToken,
  requireAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Employee ID must be a positive integer'),
    ...deleteEmployeeValidation,
    validate
  ],
  employeeController.deleteEmployee
);

module.exports = router;
