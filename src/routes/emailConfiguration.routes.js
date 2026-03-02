const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const controller = require('../controllers/emailConfigurationController');

const validateConfig = [
  body('smtp_host').notEmpty().withMessage('SMTP host is required'),
  body('smtp_port').isInt({ min: 1, max: 65535 }).withMessage('Valid SMTP port is required'),
  body('smtp_user').notEmpty().withMessage('SMTP username is required')
];

router.get('/', verifyToken, requireAdmin, controller.getConfig);
router.put('/', verifyToken, requireAdmin, validateConfig, controller.updateConfig);
router.post('/test', verifyToken, requireAdmin, controller.testConnection);

module.exports = router;
