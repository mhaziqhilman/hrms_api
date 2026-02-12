const express = require('express');
const { body } = require('express-validator');
const emailTemplateController = require('../controllers/emailTemplateController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

/**
 * @route   GET /api/email-templates
 * @desc    Get all email templates for company
 * @access  Private (Admin)
 */
router.get('/', verifyToken, requireAdmin, emailTemplateController.getAllTemplates);

/**
 * @route   GET /api/email-templates/:key
 * @desc    Get email template by key
 * @access  Private (Admin)
 */
router.get('/:key', verifyToken, requireAdmin, emailTemplateController.getTemplate);

/**
 * @route   PUT /api/email-templates/:key
 * @desc    Update email template
 * @access  Private (Admin)
 */
router.put(
  '/:key',
  verifyToken,
  requireAdmin,
  [
    body('subject').optional().notEmpty().withMessage('Subject cannot be empty'),
    body('body').optional().notEmpty().withMessage('Body cannot be empty'),
    validate
  ],
  emailTemplateController.updateTemplate
);

/**
 * @route   POST /api/email-templates/:key/preview
 * @desc    Preview email template with sample data
 * @access  Private (Admin)
 */
router.post('/:key/preview', verifyToken, requireAdmin, emailTemplateController.previewTemplate);

/**
 * @route   POST /api/email-templates/:key/reset
 * @desc    Reset email template to system default
 * @access  Private (Admin)
 */
router.post('/:key/reset', verifyToken, requireAdmin, emailTemplateController.resetTemplate);

module.exports = router;
