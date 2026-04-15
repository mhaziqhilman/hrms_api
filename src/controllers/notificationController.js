const { Op } = require('sequelize');
const Notification = require('../models/Notification');
const DeviceToken = require('../models/DeviceToken');
const logger = require('../utils/logger');

/**
 * Get notifications for the current user
 * GET /api/notifications?is_read=true/false&type=leave_approved&search=text&page=1&limit=10
 */
const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.company_id;
    const { is_read, type, search, page = 1, limit = 20 } = req.query;

    const where = { user_id: userId };
    if (companyId) where.company_id = companyId;

    if (is_read !== undefined && is_read !== '') {
      where.is_read = is_read === 'true';
    }

    if (type) {
      where.type = type;
    }

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { message: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Notification.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        currentPage: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching notifications:', error);
    next(error);
  }
};

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.company_id;

    const where = { user_id: userId, is_read: false };
    if (companyId) where.company_id = companyId;

    const count = await Notification.count({ where });

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    logger.error('Error fetching unread count:', error);
    next(error);
  }
};

/**
 * Mark a single notification as read
 * PATCH /api/notifications/:id/read
 */
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { id, user_id: userId }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    if (!notification.is_read) {
      await notification.update({
        is_read: true,
        read_at: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    next(error);
  }
};

/**
 * Mark all notifications as read
 * PATCH /api/notifications/mark-all-read
 */
const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.company_id;

    const where = { user_id: userId, is_read: false };
    if (companyId) where.company_id = companyId;

    const [updatedCount] = await Notification.update(
      { is_read: true, read_at: new Date() },
      { where }
    );

    res.json({
      success: true,
      message: `${updatedCount} notifications marked as read`
    });
  } catch (error) {
    logger.error('Error marking all as read:', error);
    next(error);
  }
};

/**
 * Delete a notification
 * DELETE /api/notifications/:id
 */
const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { id, user_id: userId }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await notification.destroy();

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    logger.error('Error deleting notification:', error);
    next(error);
  }
};

/**
 * Register or refresh a device token for push notifications
 * POST /api/notifications/device-token
 * Body: { token, platform, device_id?, device_model?, app_version? }
 */
const registerDeviceToken = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { token, platform, device_id, device_model, app_version } = req.body;

    if (!token || !platform) {
      return res.status(400).json({
        success: false,
        message: 'token and platform are required'
      });
    }

    if (!['ios', 'android', 'web'].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'platform must be ios, android, or web'
      });
    }

    const [record, created] = await DeviceToken.findOrCreate({
      where: { token },
      defaults: {
        user_id: userId,
        token,
        platform,
        device_id,
        device_model,
        app_version,
        last_seen_at: new Date(),
        is_active: true
      }
    });

    if (!created) {
      await record.update({
        user_id: userId,
        platform,
        device_id: device_id ?? record.device_id,
        device_model: device_model ?? record.device_model,
        app_version: app_version ?? record.app_version,
        last_seen_at: new Date(),
        is_active: true
      });
    }

    res.json({
      success: true,
      message: created ? 'Device token registered' : 'Device token refreshed',
      data: { id: record.id }
    });
  } catch (error) {
    logger.error('Error registering device token:', error);
    next(error);
  }
};

/**
 * Unregister a device token (on logout)
 * DELETE /api/notifications/device-token
 * Body: { token }
 */
const unregisterDeviceToken = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'token is required'
      });
    }

    const deleted = await DeviceToken.destroy({
      where: { token, user_id: userId }
    });

    res.json({
      success: true,
      message: deleted ? 'Device token unregistered' : 'Token not found',
      data: { deleted }
    });
  } catch (error) {
    logger.error('Error unregistering device token:', error);
    next(error);
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  registerDeviceToken,
  unregisterDeviceToken
};
