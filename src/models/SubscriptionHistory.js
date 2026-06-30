const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * SubscriptionHistory — full audit trail of every plan change
 * (creation, upgrade, downgrade, renewal, cancellation, trial events,
 * and Super Admin overrides). Append-only.
 */
const SubscriptionHistory = sequelize.define('SubscriptionHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  public_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    allowNull: true,
    unique: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  from_package_id: {
    type: DataTypes.INTEGER,
    allowNull: true, // NULL on first subscription
    references: {
      model: 'packages',
      key: 'id'
    }
  },
  to_package_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'packages',
      key: 'id'
    }
  },
  action: {
    type: DataTypes.ENUM(
      'created',
      'upgraded',
      'downgraded',
      'renewed',
      'canceled',
      'trial_started',
      'trial_ended',
      'admin_override'
    ),
    allowNull: false
  },
  changed_by: {
    type: DataTypes.INTEGER,
    allowNull: true, // who triggered it (self / admin / super_admin / system)
    references: {
      model: 'users',
      key: 'id'
    }
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  }
}, {
  tableName: 'subscription_history',
  timestamps: true,
  updatedAt: false, // append-only — created_at only
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['action'] },
    { fields: ['created_at'] }
  ]
});

module.exports = SubscriptionHistory;
