const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LeaveType = sequelize.define('LeaveType', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  days_per_year: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  is_paid: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  carry_forward_allowed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  carry_forward_max_days: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  prorate_for_new_joiners: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  requires_document: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'leave_types',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = LeaveType;
