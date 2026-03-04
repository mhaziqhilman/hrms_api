const express = require('express');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const { getAuditLogs } = require('../controllers/auditLogController');

const router = express.Router();

/**
 * @route   GET /api/audit-logs
 * @desc    List audit log entries (super_admin only)
 * @access  Private (super_admin)
 */
router.get('/', verifyToken, requireRole(['super_admin']), getAuditLogs);

module.exports = router;
