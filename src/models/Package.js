const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Package — catalog of subscription tiers (Basic / Professional / Enterprise).
 * Seeded once via database/seeds/seed-packages.js, rarely changed.
 *
 * Two independent flags:
 *   is_active    — the plan exists in the catalog at all (soft-disable).
 *   is_available — users may self-select / subscribe to it. Pro & Enterprise
 *                  are launched with is_available = false ("Coming Soon");
 *                  only a Super Admin override can place a user on them.
 */
const Package = sequelize.define('Package', {
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
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  tier: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '1 = Basic, 2 = Professional, 3 = Enterprise. Used for ordering / comparisons.'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  price_monthly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  price_yearly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'MYR'
  },
  // { payroll: true, claims: true, analytics: false, ... }
  features: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  // { max_companies: 1, max_employees_per_company: 10 }  (-1 = unlimited)
  limits: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {}
  },
  trial_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Plan exists in the catalog (soft-disable to remove entirely).'
  },
  is_available: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Users may self-subscribe. false = "Coming Soon" (admin override only).'
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'packages',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['slug'], unique: true },
    { fields: ['tier'] },
    { fields: ['is_active'] },
    { fields: ['is_available'] }
  ]
});

module.exports = Package;
