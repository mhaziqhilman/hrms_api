const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Subscription — one ACTIVE row per user (user_id is unique).
 * Historical plan changes are recorded in SubscriptionHistory.
 *
 * Prepared for a future payment gateway (Stripe / Billplz / iPay88) via the
 * nullable payment_provider* columns — no schema change needed to plug one in.
 */
const Subscription = sequelize.define('Subscription', {
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
    unique: true, // one active subscription per user
    references: {
      model: 'users',
      key: 'id'
    }
  },
  package_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'packages',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('trialing', 'active', 'past_due', 'canceled', 'expired'),
    allowNull: false,
    defaultValue: 'active'
  },
  billing_cycle: {
    type: DataTypes.ENUM('monthly', 'yearly', 'none'),
    allowNull: false,
    defaultValue: 'none'
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  current_period_start: {
    type: DataTypes.DATE,
    allowNull: true
  },
  current_period_end: {
    type: DataTypes.DATE,
    allowNull: true // NULL for free / non-expiring plans
  },
  trial_ends_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancel_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  canceled_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  payment_provider: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  payment_provider_subscription_id: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'subscriptions',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'], unique: true },
    { fields: ['package_id'] },
    { fields: ['status'] },
    { fields: ['current_period_end'] }
  ]
});

module.exports = Subscription;
