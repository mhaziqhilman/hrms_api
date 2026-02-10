const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserSettings = sequelize.define('UserSettings', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // Appearance settings
  theme: {
    type: DataTypes.ENUM('light', 'dark', 'system'),
    defaultValue: 'light'
  },
  sidebar_collapsed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  compact_mode: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Display settings
  language: {
    type: DataTypes.STRING(10),
    defaultValue: 'en'
  },
  timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'Asia/Kuala_Lumpur'
  },
  date_format: {
    type: DataTypes.STRING(20),
    defaultValue: 'DD/MM/YYYY'
  },
  time_format: {
    type: DataTypes.ENUM('12h', '24h'),
    defaultValue: '12h'
  },
  // Notification settings
  email_notifications: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  push_notifications: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  notify_leave_approval: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  notify_claim_approval: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  notify_payslip_ready: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  notify_memo_received: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  notify_policy_update: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Account settings
  two_factor_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  two_factor_secret: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  session_timeout_minutes: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  }
}, {
  tableName: 'user_settings',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Instance method to get safe settings (without sensitive data)
UserSettings.prototype.toSafeJSON = function() {
  const values = { ...this.get() };
  delete values.two_factor_secret;
  return values;
};

module.exports = UserSettings;
