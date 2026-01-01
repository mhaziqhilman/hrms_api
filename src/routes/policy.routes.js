const express = require('express');
const router = express.Router();
const policyController = require('../controllers/policyController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireManager } = require('../middleware/rbac.middleware');
const { body, param, query, validationResult } = require('express-validator');

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

// Validation rules
const createPolicyValidation = [
  body('policy_code')
    .notEmpty().withMessage('Policy code is required')
    .isLength({ max: 50 }).withMessage('Policy code must be at most 50 characters'),
  body('title')
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title must be at most 200 characters'),
  body('description')
    .optional(),
  body('content')
    .notEmpty().withMessage('Content is required'),
  body('category')
    .optional()
    .isIn(['HR', 'IT', 'Finance', 'Safety', 'Compliance', 'Operations', 'Other']).withMessage('Invalid category'),
  body('version')
    .optional()
    .isLength({ max: 20 }).withMessage('Version must be at most 20 characters'),
  body('status')
    .optional()
    .isIn(['Draft', 'Active', 'Archived', 'Superseded']).withMessage('Invalid status'),
  body('effective_from')
    .optional()
    .isISO8601().withMessage('Effective from must be a valid date'),
  body('review_date')
    .optional()
    .isISO8601().withMessage('Review date must be a valid date'),
  body('expires_at')
    .optional()
    .isISO8601().withMessage('Expires at must be a valid date'),
  body('requires_acknowledgment')
    .optional()
    .isBoolean().withMessage('Requires acknowledgment must be a boolean'),
  body('file_url')
    .optional()
    .isURL().withMessage('File URL must be a valid URL'),
  body('file_size')
    .optional()
    .isInt({ min: 0 }).withMessage('File size must be a positive integer'),
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array'),
  body('parent_policy_id')
    .optional()
    .isInt().withMessage('Parent policy ID must be an integer')
];

const updatePolicyValidation = [
  param('id').isInt().withMessage('Policy ID must be an integer'),
  body('policy_code')
    .optional()
    .notEmpty().withMessage('Policy code cannot be empty')
    .isLength({ max: 50 }).withMessage('Policy code must be at most 50 characters'),
  body('title')
    .optional()
    .notEmpty().withMessage('Title cannot be empty')
    .isLength({ max: 200 }).withMessage('Title must be at most 200 characters'),
  body('description')
    .optional(),
  body('content')
    .optional()
    .notEmpty().withMessage('Content cannot be empty'),
  body('category')
    .optional()
    .isIn(['HR', 'IT', 'Finance', 'Safety', 'Compliance', 'Operations', 'Other']).withMessage('Invalid category'),
  body('version')
    .optional()
    .isLength({ max: 20 }).withMessage('Version must be at most 20 characters'),
  body('status')
    .optional()
    .isIn(['Draft', 'Active', 'Archived', 'Superseded']).withMessage('Invalid status'),
  body('effective_from')
    .optional()
    .isISO8601().withMessage('Effective from must be a valid date'),
  body('review_date')
    .optional()
    .isISO8601().withMessage('Review date must be a valid date'),
  body('expires_at')
    .optional()
    .isISO8601().withMessage('Expires at must be a valid date'),
  body('requires_acknowledgment')
    .optional()
    .isBoolean().withMessage('Requires acknowledgment must be a boolean'),
  body('file_url')
    .optional()
    .isURL().withMessage('File URL must be a valid URL'),
  body('file_size')
    .optional()
    .isInt({ min: 0 }).withMessage('File size must be a positive integer'),
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array')
];

const idParamValidation = [
  param('id').isInt().withMessage('ID must be an integer')
];

const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['Draft', 'Active', 'Archived', 'Superseded']).withMessage('Invalid status'),
  query('category')
    .optional()
    .isIn(['HR', 'IT', 'Finance', 'Safety', 'Compliance', 'Operations', 'Other']).withMessage('Invalid category'),
  query('search')
    .optional()
    .isString().withMessage('Search must be a string'),
  query('author_id')
    .optional()
    .isInt().withMessage('Author ID must be an integer'),
  query('include_expired')
    .optional()
    .isBoolean().withMessage('Include expired must be a boolean')
];

const acknowledgeValidation = [
  param('id').isInt().withMessage('Policy ID must be an integer'),
  body('comments')
    .optional()
    .isString().withMessage('Comments must be a string')
];

/**
 * @route   POST /api/policies
 * @desc    Create a new policy
 * @access  Private (Admin, Manager)
 */
router.post(
  '/',
  verifyToken,
  requireManager,
  createPolicyValidation,
  validate,
  policyController.createPolicy
);

/**
 * @route   GET /api/policies
 * @desc    Get all policies with pagination and filtering
 * @access  Private (All authenticated users)
 */
router.get(
  '/',
  verifyToken,
  queryValidation,
  validate,
  policyController.getAllPolicies
);

/**
 * @route   GET /api/policies/categories
 * @desc    Get policy categories with counts
 * @access  Private (All authenticated users)
 */
router.get(
  '/categories',
  verifyToken,
  policyController.getPolicyCategories
);

/**
 * @route   GET /api/policies/:id
 * @desc    Get single policy by ID
 * @access  Private (All authenticated users)
 */
router.get(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  policyController.getPolicyById
);

/**
 * @route   PUT /api/policies/:id
 * @desc    Update policy
 * @access  Private (Admin, Author)
 */
router.put(
  '/:id',
  verifyToken,
  updatePolicyValidation,
  validate,
  policyController.updatePolicy
);

/**
 * @route   DELETE /api/policies/:id
 * @desc    Delete policy
 * @access  Private (Admin only)
 */
router.delete(
  '/:id',
  verifyToken,
  requireAdmin,
  idParamValidation,
  validate,
  policyController.deletePolicy
);

/**
 * @route   POST /api/policies/:id/approve
 * @desc    Approve a policy
 * @access  Private (Admin only)
 */
router.post(
  '/:id/approve',
  verifyToken,
  requireAdmin,
  idParamValidation,
  validate,
  policyController.approvePolicy
);

/**
 * @route   POST /api/policies/:id/acknowledge
 * @desc    Acknowledge reading and understanding a policy
 * @access  Private (All authenticated users)
 */
router.post(
  '/:id/acknowledge',
  verifyToken,
  acknowledgeValidation,
  validate,
  policyController.acknowledgePolicy
);

/**
 * @route   GET /api/policies/:id/statistics
 * @desc    Get policy acknowledgment statistics
 * @access  Private (Admin, Manager, Author)
 */
router.get(
  '/:id/statistics',
  verifyToken,
  idParamValidation,
  validate,
  policyController.getPolicyStatistics
);

module.exports = router;
