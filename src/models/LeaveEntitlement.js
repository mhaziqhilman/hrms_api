const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LeaveEntitlement = sequelize.define('LeaveEntitlement', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'employees',
      key: 'id'
    }
  },
  leave_type_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'leave_types',
      key: 'id'
    }
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  total_days: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  used_days: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  pending_days: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
  },
  balance_days: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  carry_forward_days: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0
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
  tableName: 'leave_entitlements',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['employee_id', 'leave_type_id', 'year']
    }
  ]
});

module.exports = LeaveEntitlement;
