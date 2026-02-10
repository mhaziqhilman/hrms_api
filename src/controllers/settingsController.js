const { User, UserSettings, Employee } = require('../models');
const logger = require('../utils/logger');

/**
 * Get all user settings
 */
const getSettings = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find or create settings for user
    let [settings, created] = await UserSettings.findOrCreate({
      where: { user_id: userId },
      defaults: { user_id: userId }
    });

    if (created) {
      logger.info(`Created default settings for user: ${userId}`);
    }

    res.json({
      success: true,
      data: settings.toSafeJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update appearance settings (theme, sidebar, compact mode)
 */
const updateAppearanceSettings = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { theme, sidebar_collapsed, compact_mode } = req.body;

    let [settings] = await UserSettings.findOrCreate({
      where: { user_id: userId },
      defaults: { user_id: userId }
    });

    // Update only appearance fields
    if (theme !== undefined) settings.theme = theme;
    if (sidebar_collapsed !== undefined) settings.sidebar_collapsed = sidebar_collapsed;
    if (compact_mode !== undefined) settings.compact_mode = compact_mode;

    await settings.save();

    logger.info(`Appearance settings updated for user: ${userId}`);

    res.json({
      success: true,
      message: 'Appearance settings updated successfully',
      data: settings.toSafeJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update display settings (language, timezone, date/time format)
 */
const updateDisplaySettings = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { language, timezone, date_format, time_format } = req.body;

    let [settings] = await UserSettings.findOrCreate({
      where: { user_id: userId },
      defaults: { user_id: userId }
    });

    // Update only display fields
    if (language !== undefined) settings.language = language;
    if (timezone !== undefined) settings.timezone = timezone;
    if (date_format !== undefined) settings.date_format = date_format;
    if (time_format !== undefined) settings.time_format = time_format;

    await settings.save();

    logger.info(`Display settings updated for user: ${userId}`);

    res.json({
      success: true,
      message: 'Display settings updated successfully',
      data: settings.toSafeJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update notification settings
 */
const updateNotificationSettings = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      email_notifications,
      push_notifications,
      notify_leave_approval,
      notify_claim_approval,
      notify_payslip_ready,
      notify_memo_received,
      notify_policy_update
    } = req.body;

    let [settings] = await UserSettings.findOrCreate({
      where: { user_id: userId },
      defaults: { user_id: userId }
    });

    // Update only notification fields
    if (email_notifications !== undefined) settings.email_notifications = email_notifications;
    if (push_notifications !== undefined) settings.push_notifications = push_notifications;
    if (notify_leave_approval !== undefined) settings.notify_leave_approval = notify_leave_approval;
    if (notify_claim_approval !== undefined) settings.notify_claim_approval = notify_claim_approval;
    if (notify_payslip_ready !== undefined) settings.notify_payslip_ready = notify_payslip_ready;
    if (notify_memo_received !== undefined) settings.notify_memo_received = notify_memo_received;
    if (notify_policy_update !== undefined) settings.notify_policy_update = notify_policy_update;

    await settings.save();

    logger.info(`Notification settings updated for user: ${userId}`);

    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: settings.toSafeJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update account settings (session timeout)
 */
const updateAccountSettings = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { session_timeout_minutes } = req.body;

    let [settings] = await UserSettings.findOrCreate({
      where: { user_id: userId },
      defaults: { user_id: userId }
    });

    if (session_timeout_minutes !== undefined) {
      settings.session_timeout_minutes = session_timeout_minutes;
    }

    await settings.save();

    logger.info(`Account settings updated for user: ${userId}`);

    res.json({
      success: true,
      message: 'Account settings updated successfully',
      data: settings.toSafeJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change password (moved from auth controller for settings module)
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Validate new password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
      });
    }

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is same as current
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Update password (will be auto-hashed by User model hooks)
    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Enable two-factor authentication
 */
const enableTwoFactor = async (req, res, next) => {
  try {
    const userId = req.user.id;

    let [settings] = await UserSettings.findOrCreate({
      where: { user_id: userId },
      defaults: { user_id: userId }
    });

    // Generate a simple secret (in production, use speakeasy or similar)
    const secret = require('crypto').randomBytes(20).toString('hex');

    settings.two_factor_enabled = true;
    settings.two_factor_secret = secret;
    await settings.save();

    logger.info(`Two-factor authentication enabled for user: ${userId}`);

    res.json({
      success: true,
      message: 'Two-factor authentication enabled',
      data: {
        secret: secret // In production, return QR code instead
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Disable two-factor authentication
 */
const disableTwoFactor = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    // Verify password before disabling 2FA
    const user = await User.findByPk(userId);
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password'
      });
    }

    let settings = await UserSettings.findOne({ where: { user_id: userId } });

    if (settings) {
      settings.two_factor_enabled = false;
      settings.two_factor_secret = null;
      await settings.save();
    }

    logger.info(`Two-factor authentication disabled for user: ${userId}`);

    res.json({
      success: true,
      message: 'Two-factor authentication disabled'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get account info (email, role, last login)
 */
const getAccountInfo = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'role', 'is_active', 'last_login_at', 'created_at'],
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['full_name', 'employee_id', 'department', 'position']
      }]
    });

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset settings to default
 */
const resetToDefault = async (req, res, next) => {
  try {
    const userId = req.user.id;

    await UserSettings.destroy({ where: { user_id: userId } });

    // Create fresh default settings
    const settings = await UserSettings.create({ user_id: userId });

    logger.info(`Settings reset to default for user: ${userId}`);

    res.json({
      success: true,
      message: 'Settings reset to default',
      data: settings.toSafeJSON()
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateAppearanceSettings,
  updateDisplaySettings,
  updateNotificationSettings,
  updateAccountSettings,
  changePassword,
  enableTwoFactor,
  disableTwoFactor,
  getAccountInfo,
  resetToDefault
};
