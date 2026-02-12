const express = require('express');
const { body } = require('express-validator');
const companyController = require('../controllers/companyController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireRole } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validation.middleware');
const { upload } = require('../config/upload.config');
const storageService = require('../services/supabaseStorageService');
const { Company } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();
const requireSuperAdmin = requireRole(['super_admin']);

/**
 * @route   GET /api/company/all
 * @desc    Get all companies (super_admin only)
 * @access  Super Admin only
 */
router.get('/all', verifyToken, requireSuperAdmin, companyController.getAllCompanies);

/**
 * @route   POST /api/company/setup
 * @desc    Complete company setup wizard
 * @access  Private
 */
router.post(
  '/setup',
  verifyToken,
  [
    body('company.name').notEmpty().withMessage('Company name is required'),
    body('company.registration_no').optional(),
    body('company.industry').optional(),
    body('company.size').optional().isIn(['1-10', '11-50', '51-200', '201-500', '500+']),
    body('initialEmployee.full_name').optional().notEmpty().withMessage('Employee name is required'),
    body('initialEmployee.employee_id').optional().notEmpty().withMessage('Employee ID is required'),
    body('initialEmployee.gender').optional().isIn(['Male', 'Female']),
    body('initialEmployee.join_date').optional().isISO8601(),
    body('initialEmployee.basic_salary').optional().isNumeric(),
    body('invitations').optional().isArray(),
    body('invitations.*.email').optional().isEmail().withMessage('Invalid invitation email'),
    body('invitations.*.role').optional().isIn(['admin', 'manager', 'staff']),
    validate
  ],
  companyController.setupCompany
);

/**
 * @route   GET /api/company/my-companies
 * @desc    Get all companies the user belongs to
 * @access  Private
 */
router.get('/my-companies', verifyToken, companyController.getMyCompanies);

/**
 * @route   POST /api/company/switch
 * @desc    Switch active company
 * @access  Private
 */
router.post(
  '/switch',
  verifyToken,
  [
    body('company_id').isInt().withMessage('Company ID is required'),
    validate
  ],
  companyController.switchCompany
);

/**
 * @route   POST /api/company/clear-context
 * @desc    Clear super_admin's viewing company context
 * @access  Super Admin only
 */
router.post('/clear-context', verifyToken, requireSuperAdmin, companyController.clearCompanyContext);

/**
 * @route   GET /api/company/me
 * @desc    Get current user's company
 * @access  Private
 */
router.get('/me', verifyToken, companyController.getMyCompany);

/**
 * @route   PUT /api/company/me
 * @desc    Update company info
 * @access  Private (Admin)
 */
router.put(
  '/me',
  verifyToken,
  requireAdmin,
  [
    body('name').optional().notEmpty().withMessage('Company name cannot be empty'),
    body('size').optional().isIn(['1-10', '11-50', '51-200', '201-500', '500+']),
    validate
  ],
  companyController.updateCompany
);

/**
 * @route   POST /api/company/logo
 * @desc    Upload company logo
 * @access  Private (Admin)
 */
router.post(
  '/logo',
  verifyToken,
  requireAdmin,
  upload.single('logo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const { company_id } = req.user;
      if (!storageService.isConfigured()) {
        return res.status(500).json({ success: false, message: 'Storage service not configured' });
      }

      const ext = req.file.originalname.split('.').pop();
      const storagePath = `company/${company_id}/logo.${ext}`;

      await storageService.uploadFile(req.file.buffer, storagePath, req.file.mimetype);
      const signedUrl = await storageService.getSignedUrl(storagePath, 365 * 24 * 3600);

      await Company.update({ logo_url: storagePath }, { where: { id: company_id } });

      logger.info(`Company logo uploaded for company ${company_id}`);
      res.json({ success: true, data: { logo_url: signedUrl, storage_path: storagePath }, message: 'Logo uploaded successfully' });
    } catch (error) {
      logger.error('Error uploading company logo:', error);
      res.status(500).json({ success: false, message: 'Failed to upload logo' });
    }
  }
);

module.exports = router;
