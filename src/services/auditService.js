/**
 * Audit Service
 *
 * Non-blocking helper to record user actions.
 * Failures are silently logged but never bubble up to the caller.
 */

const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Log an auditable action.
 *
 * @param {object} params
 * @param {number}  params.userId       - ID of the acting user (req.user.id)
 * @param {number}  params.companyId    - Active company ID (req.user.company_id)
 * @param {string}  params.action       - Dot-notation action label  e.g. 'leave.approved'
 * @param {string}  [params.entityType] - Model name  e.g. 'Leave'
 * @param {string}  [params.entityId]   - public_id or internal ID of the affected record
 * @param {object}  [params.oldValues]  - Snapshot before the change
 * @param {object}  [params.newValues]  - Snapshot after the change
 * @param {object}  params.req          - Express request object (for IP & user-agent)
 */
async function log({ userId, companyId, action, entityType, entityId, oldValues, newValues, req }) {
  try {
    await AuditLog.create({
      user_id: userId,
      company_id: companyId,
      action,
      entity_type: entityType || null,
      entity_id: entityId != null ? String(entityId) : null,
      old_values: oldValues || null,
      new_values: newValues || null,
      ip_address: req?.ip || null,
      user_agent: req?.headers?.['user-agent'] || null
    });
  } catch (err) {
    // Audit failure must never break the main request
    logger.error('Audit log failed:', err.message);
  }
}

module.exports = { log };
