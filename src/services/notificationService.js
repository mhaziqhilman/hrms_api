const Notification = require('../models/Notification');
const UserSettings = require('../models/UserSettings');
const logger = require('../utils/logger');

// Map notification types to the corresponding user_settings preference column
const TYPE_TO_PREFERENCE = {
  leave_approved: 'notify_leave_approval',
  leave_rejected: 'notify_leave_approval',
  claim_approved: 'notify_claim_approval',
  claim_rejected: 'notify_claim_approval',
  claim_finance_approved: 'notify_claim_approval',
  claim_finance_rejected: 'notify_claim_approval',
  wfh_approved: 'notify_leave_approval',
  wfh_rejected: 'notify_leave_approval',
  announcement_published: 'notify_memo_received',
  policy_published: 'notify_policy_update',
  payslip_ready: 'notify_payslip_ready'
  // team_member_joined has no toggle — always sent
};

class NotificationService {
  /**
   * Check if a user has the given notification type enabled.
   * Returns true if no settings exist (defaults are all true).
   */
  async isNotificationEnabled(userId, type) {
    const prefColumn = TYPE_TO_PREFERENCE[type];
    if (!prefColumn) return true; // no preference toggle → always enabled

    try {
      const settings = await UserSettings.findOne({ where: { user_id: userId } });
      if (!settings) return true; // no settings row → defaults are all true

      // Check the master push_notifications toggle first
      if (settings.push_notifications === false) return false;

      return settings[prefColumn] !== false;
    } catch (error) {
      logger.warn(`Failed to check notification preference for user ${userId}: ${error.message}`);
      return true; // on error, allow the notification
    }
  }

  /**
   * Create a single notification (respects user preferences)
   */
  async createNotification(userId, companyId, type, title, message, data = {}) {
    try {
      const enabled = await this.isNotificationEnabled(userId, type);
      if (!enabled) {
        logger.info(`Notification skipped (user preference): type=${type}, user=${userId}`);
        return null;
      }

      const notification = await Notification.create({
        user_id: userId,
        company_id: companyId,
        type,
        title,
        message,
        data
      });
      logger.info(`Notification created: type=${type}, user=${userId}`);
      return notification;
    } catch (error) {
      logger.error('Failed to create notification:', error.message);
      // Don't throw - notification failure shouldn't break the main operation
      return null;
    }
  }

  /**
   * Create notifications for multiple users (respects each user's preferences)
   */
  async createBulkNotifications(userIds, companyId, type, title, message, data = {}) {
    try {
      const prefColumn = TYPE_TO_PREFERENCE[type];

      let filteredUserIds = userIds;

      // If this type has a preference toggle, filter out users who disabled it
      if (prefColumn) {
        const settings = await UserSettings.findAll({
          where: { user_id: userIds },
          attributes: ['user_id', 'push_notifications', prefColumn]
        });

        const disabledUserIds = new Set();
        for (const s of settings) {
          if (s.push_notifications === false || s[prefColumn] === false) {
            disabledUserIds.add(s.user_id);
          }
        }

        filteredUserIds = userIds.filter(id => !disabledUserIds.has(id));

        if (filteredUserIds.length < userIds.length) {
          logger.info(`Bulk notifications: ${userIds.length - filteredUserIds.length} users skipped (preferences), type=${type}`);
        }
      }

      if (filteredUserIds.length === 0) {
        logger.info(`Bulk notifications: all users opted out, type=${type}`);
        return [];
      }

      const records = filteredUserIds.map(userId => ({
        user_id: userId,
        company_id: companyId,
        type,
        title,
        message,
        data
      }));
      const notifications = await Notification.bulkCreate(records);
      logger.info(`Bulk notifications created: type=${type}, count=${notifications.length}`);
      return notifications;
    } catch (error) {
      logger.error('Failed to create bulk notifications:', error.message);
      return [];
    }
  }
}

module.exports = new NotificationService();
