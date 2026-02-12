const express = require('express');
const { body } = require('express-validator');
const statutoryConfigController = require('../controllers/statutoryConfigController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

/**
 * @route   GET /api/statutory-config
 * @desc    Get all statutory configuration for company
 * @access  Private (Admin)
 */
router.get('/', verifyToken, requireAdmin, statutoryConfigController.getStatutoryConfig);

/**
 * @route   PUT /api/statutory-config
 * @desc    Bulk update statutory configuration
 * @access  Private (Admin)
 */
router.put(
  '/',
  verifyToken,
  requireAdmin,
  [
    body('configs').isArray({ min: 1 }).withMessage('Configs array is required'),
    body('configs.*.config_key').notEmpty().withMessage('Config key is required'),
    body('configs.*.config_value').notEmpty().withMessage('Config value is required'),
    validate
  ],
  statutoryConfigController.updateStatutoryConfig
);

module.exports = router;
