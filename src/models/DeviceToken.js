const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DeviceToken = sequelize.define('DeviceToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  token: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true
  },
  platform: {
    type: DataTypes.ENUM('ios', 'android', 'web'),
    allowNull: false
  },
  device_id: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  device_model: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  app_version: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  last_seen_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'device_tokens',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['token'], unique: true },
    { fields: ['is_active'] }
  ]
});

module.exports = DeviceToken;
