const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const { upload } = require('../config/upload.config');
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
const uploadValidation = [
  body('category').isIn(['employee_document', 'claim_receipt', 'payslip', 'leave_document', 'company_document', 'invoice', 'other']).withMessage('Invalid category'),
  body('related_to_employee_id').optional().isInt().withMessage('Employee ID must be an integer'),
  body('related_to_claim_id').optional().isInt().withMessage('Claim ID must be an integer'),
  body('related_to_leave_id').optional().isInt().withMessage('Leave ID must be an integer')
];

const idParamValidation = [
  param('id').isInt().withMessage('ID must be an integer')
];

const employeeIdParamValidation = [
  param('employee_id').isInt().withMessage('Employee ID must be an integer')
];

const claimIdParamValidation = [
  param('claim_id').isInt().withMessage('Claim ID must be an integer')
];

const queryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

/**
 * @route   POST /api/files/upload
 * @desc    Upload single or multiple files
 * @access  Private (All authenticated users)
 */
router.post(
  '/upload',
  verifyToken,
  upload.array('files', 10), // Accept up to 10 files with field name 'files'
  uploadValidation,
  validate,
  fileController.uploadFiles
);

/**
 * @route   GET /api/files
 * @desc    Get all files with filters
 * @access  Private (All authenticated users - filtered by role)
 */
router.get(
  '/',
  verifyToken,
  queryValidation,
  validate,
  fileController.getAllFiles
);

/**
 * @route   GET /api/files/:id
 * @desc    Get file metadata by ID
 * @access  Private (Owner, Admin)
 */
router.get(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  fileController.getFileById
);

/**
 * @route   GET /api/files/:id/download
 * @desc    Download file
 * @access  Private (Owner, Admin)
 */
router.get(
  '/:id/download',
  verifyToken,
  idParamValidation,
  validate,
  fileController.downloadFile
);

/**
 * @route   GET /api/files/:id/preview
 * @desc    Preview file (inline)
 * @access  Private (Owner, Admin)
 */
router.get(
  '/:id/preview',
  verifyToken,
  idParamValidation,
  validate,
  fileController.previewFile
);

/**
 * @route   PUT /api/files/:id
 * @desc    Update file metadata
 * @access  Private (Owner, Admin)
 */
router.put(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  fileController.updateFileMetadata
);

/**
 * @route   DELETE /api/files/:id
 * @desc    Soft delete file
 * @access  Private (Owner, Admin)
 */
router.delete(
  '/:id',
  verifyToken,
  idParamValidation,
  validate,
  fileController.deleteFile
);

/**
 * @route   DELETE /api/files/:id/permanent
 * @desc    Permanently delete file
 * @access  Private (Admin only)
 */
router.delete(
  '/:id/permanent',
  verifyToken,
  requireAdmin,
  idParamValidation,
  validate,
  fileController.permanentDeleteFile
);

/**
 * @route   POST /api/files/bulk-delete
 * @desc    Delete multiple files
 * @access  Private (Owner, Admin)
 */
router.post(
  '/bulk-delete',
  verifyToken,
  body('file_ids').isArray().withMessage('file_ids must be an array'),
  validate,
  fileController.bulkDeleteFiles
);

/**
 * @route   GET /api/files/employee/:employee_id
 * @desc    Get files by employee ID
 * @access  Private (Admin, Manager, Owner)
 */
router.get(
  '/employee/:employee_id',
  verifyToken,
  employeeIdParamValidation,
  queryValidation,
  validate,
  fileController.getFilesByEmployee
);

/**
 * @route   GET /api/files/claim/:claim_id
 * @desc    Get files by claim ID
 * @access  Private (Admin, Manager, Owner)
 */
router.get(
  '/claim/:claim_id',
  verifyToken,
  claimIdParamValidation,
  queryValidation,
  validate,
  fileController.getFilesByClaim
);

/**
 * @route   GET /api/files/stats/storage
 * @desc    Get storage statistics
 * @access  Private (Admin only)
 */
router.get(
  '/stats/storage',
  verifyToken,
  requireAdmin,
  fileController.getStorageStats
);

module.exports = router;
