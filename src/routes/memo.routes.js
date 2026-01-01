const express = require('express');
const router = express.Router();
const memoController = require('../controllers/memoController');
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
const createMemoValidation = [
  body('title')
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title must be at most 200 characters'),
  body('content')
    .notEmpty().withMessage('Content is required'),
  body('summary')
    .optional()
    .isLength({ max: 500 }).withMessage('Summary must be at most 500 characters'),
  body('status')
    .optional()
    .isIn(['Draft', 'Published', 'Archived']).withMessage('Invalid status'),
  body('priority')
    .optional()
    .isIn(['Low', 'Normal', 'High', 'Urgent']).withMessage('Invalid priority'),
  body('target_audience')
    .optional()
    .isIn(['All', 'Department', 'Position', 'Specific']).withMessage('Invalid target audience'),
  body('target_departments')
    .optional()
    .isArray().withMessage('Target departments must be an array'),
  body('target_positions')
    .optional()
    .isArray().withMessage('Target positions must be an array'),
  body('target_employee_ids')
    .optional()
    .isArray().withMessage('Target employee IDs must be an array'),
  body('published_at')
    .optional()
    .isISO8601().withMessage('Published at must be a valid date'),
  body('expires_at')
    .optional()
    .isISO8601().withMessage('Expires at must be a valid date'),
  body('requires_acknowledgment')
    .optional()
    .isBoolean().withMessage('Requires acknowledgment must be a boolean')
];

const updateMemoValidation = [
  param('id').isInt().withMessage('Memo ID must be an integer'),
  body('title')
    .optional()
    .notEmpty().withMessage('Title cannot be empty')
    .isLength({ max: 200 }).withMessage('Title must be at most 200 characters'),
  body('content')
    .optional()
    .notEmpty().withMessage('Content cannot be empty'),
  body('summary')
    .optional()
    .isLength({ max: 500 }).withMessage('Summary must be at most 500 characters'),
  body('status')
    .optional()
    .isIn(['Draft', 'Published', 'Archived']).withMessage('Invalid status'),
  body('priority')
    .optional()
    .isIn(['Low', 'Normal', 'High', 'Urgent']).withMessage('Invalid priority'),
  body('target_audience')
    .optional()
    .isIn(['All', 'Department', 'Position', 'Specific']).withMessage('Invalid target audience'),
  body('target_departments')
    .optional()
    .isArray().withMessage('Target departments must be an array'),
  body('target_positions')
    .optional()
    .isArray().withMessage('Target positions must be an array'),
  body('target_employee_ids')
    .optional()
    .isArray().withMessage('Target employee IDs must be an array'),
  body('expires_at')
    .optional()
    .isISO8601().withMessage('Expires at must be a valid date'),
  body('requires_acknowledgment')
    .optional()
    .isBoolean().withMessage('Requires acknowledgment must be a boolean')
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
    .isIn(['Draft', 'Published', 'Archived']).withMessage('Invalid status'),
  query('priority')
    .optional()
    .isIn(['Low', 'Normal', 'High', 'Urgent']).withMessage('Invalid priority'),
  query('target_audience')
    .optional()
    .isIn(['All', 'Department', 'Position', 'Specific']).withMessage('Invalid target audience'),
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

/**
 * @route   POST /api/memos
 * @desc    Create a new memo
 * @access  Private (Admin, Manager)
 */
router.post(
  '/',
  verifyToken,
  requireManager,
  createMemoValidation,
  validate,
  memoController.createMemo
);

/**
 * @route   GET /api/memos
 * @desc    Get all memos with pagination and filtering
 * @access  Private (All authenticated users)
 */
router.get(
  '/',
  verifyToken,
  queryValidation,
  validate,
  memoController.getAllMemos
);

/**
 * @route   GET /api/memos/:id
 * @desc    Get single memo by ID
 * @access  Private (All authenticated users)
 */
router.get(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  memoController.getMemoById
);

/**
 * @route   PUT /api/memos/:id
 * @desc    Update memo
 * @access  Private (Admin, Author)
 */
router.put(
  '/:id',
  verifyToken,
  updateMemoValidation,
  validate,
  memoController.updateMemo
);

/**
 * @route   DELETE /api/memos/:id
 * @desc    Delete memo
 * @access  Private (Admin, Author)
 */
router.delete(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  memoController.deleteMemo
);

/**
 * @route   POST /api/memos/:id/acknowledge
 * @desc    Acknowledge reading a memo
 * @access  Private (Staff)
 */
router.post(
  '/:id/acknowledge',
  verifyToken,
  idParamValidation,
  validate,
  memoController.acknowledgeMemo
);

/**
 * @route   GET /api/memos/:id/statistics
 * @desc    Get memo read statistics
 * @access  Private (Admin, Manager, Author)
 */
router.get(
  '/:id/statistics',
  verifyToken,
  idParamValidation,
  validate,
  memoController.getMemoStatistics
);

module.exports = router;
