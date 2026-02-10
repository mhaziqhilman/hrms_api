const express = require('express');
const { body } = require('express-validator');
const settingsController = require('../controllers/settingsController');
const { verifyToken } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

// All settings routes require authentication
router.use(verifyToken);

/**
 * @route   GET /api/settings
 * @desc    Get all user settings
 * @access  Private
 */
router.get('/', settingsController.getSettings);

/**
 * @route   GET /api/settings/account
 * @desc    Get account information
 * @access  Private
 */
router.get('/account', settingsController.getAccountInfo);

/**
 * @route   PUT /api/settings/appearance
 * @desc    Update appearance settings (theme, sidebar, compact mode)
 * @access  Private
 */
router.put(
  '/appearance',
  [
    body('theme')
      .optional()
      .isIn(['light', 'dark', 'system'])
      .withMessage('Theme must be light, dark, or system'),
    body('sidebar_collapsed')
      .optional()
      .isBoolean()
      .withMessage('Sidebar collapsed must be a boolean'),
    body('compact_mode')
      .optional()
      .isBoolean()
      .withMessage('Compact mode must be a boolean'),
    validate
  ],
  settingsController.updateAppearanceSettings
);

/**
 * @route   PUT /api/settings/display
 * @desc    Update display settings (language, timezone, date/time format)
 * @access  Private
 */
router.put(
  '/display',
  [
    body('language')
      .optional()
      .isLength({ min: 2, max: 10 })
      .withMessage('Language code must be 2-10 characters'),
    body('timezone')
      .optional()
      .isLength({ max: 50 })
      .withMessage('Timezone must be max 50 characters'),
    body('date_format')
      .optional()
      .isLength({ max: 20 })
      .withMessage('Date format must be max 20 characters'),
    body('time_format')
      .optional()
      .isIn(['12h', '24h'])
      .withMessage('Time format must be 12h or 24h'),
    validate
  ],
  settingsController.updateDisplaySettings
);

/**
 * @route   PUT /api/settings/notifications
 * @desc    Update notification settings
 * @access  Private
 */
router.put(
  '/notifications',
  [
    body('email_notifications')
      .optional()
      .isBoolean()
      .withMessage('Email notifications must be a boolean'),
    body('push_notifications')
      .optional()
      .isBoolean()
      .withMessage('Push notifications must be a boolean'),
    body('notify_leave_approval')
      .optional()
      .isBoolean()
      .withMessage('Notify leave approval must be a boolean'),
    body('notify_claim_approval')
      .optional()
      .isBoolean()
      .withMessage('Notify claim approval must be a boolean'),
    body('notify_payslip_ready')
      .optional()
      .isBoolean()
      .withMessage('Notify payslip ready must be a boolean'),
    body('notify_memo_received')
      .optional()
      .isBoolean()
      .withMessage('Notify memo received must be a boolean'),
    body('notify_policy_update')
      .optional()
      .isBoolean()
      .withMessage('Notify policy update must be a boolean'),
    validate
  ],
  settingsController.updateNotificationSettings
);

/**
 * @route   PUT /api/settings/account
 * @desc    Update account settings (session timeout)
 * @access  Private
 */
router.put(
  '/account',
  [
    body('session_timeout_minutes')
      .optional()
      .isInt({ min: 5, max: 480 })
      .withMessage('Session timeout must be between 5 and 480 minutes'),
    validate
  ],
  settingsController.updateAccountSettings
);

/**
 * @route   POST /api/settings/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/)
      .withMessage('Password must contain at least one uppercase letter')
      .matches(/[a-z]/)
      .withMessage('Password must contain at least one lowercase letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain at least one number')
      .matches(/[@$!%*?&]/)
      .withMessage('Password must contain at least one special character (@$!%*?&)'),
    validate
  ],
  settingsController.changePassword
);

/**
 * @route   POST /api/settings/two-factor/enable
 * @desc    Enable two-factor authentication
 * @access  Private
 */
router.post('/two-factor/enable', settingsController.enableTwoFactor);

/**
 * @route   POST /api/settings/two-factor/disable
 * @desc    Disable two-factor authentication
 * @access  Private
 */
router.post(
  '/two-factor/disable',
  [
    body('password').notEmpty().withMessage('Password is required to disable 2FA'),
    validate
  ],
  settingsController.disableTwoFactor
);

/**
 * @route   POST /api/settings/reset
 * @desc    Reset all settings to default
 * @access  Private
 */
router.post('/reset', settingsController.resetToDefault);

module.exports = router;
