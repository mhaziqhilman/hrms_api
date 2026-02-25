const Notification = require('../models/Notification');
const logger = require('../utils/logger');

class NotificationService {
  /**
   * Create a single notification
   */
  async createNotification(userId, companyId, type, title, message, data = {}) {
    try {
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
   * Create notifications for multiple users (e.g., announcements)
   */
  async createBulkNotifications(userIds, companyId, type, title, message, data = {}) {
    try {
      const records = userIds.map(userId => ({
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
