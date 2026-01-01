const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PolicyAcknowledgment = sequelize.define('PolicyAcknowledgment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  policy_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'policies',
      key: 'id'
    },
    field: 'policy_id',
    onDelete: 'CASCADE'
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'employees',
      key: 'id'
    },
    field: 'employee_id',
    onDelete: 'CASCADE'
  },
  viewed_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'viewed_at',
    comment: 'Timestamp when employee first viewed the policy'
  },
  acknowledged_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'acknowledged_at',
    comment: 'Timestamp when employee acknowledged understanding'
  },
  policy_version: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'policy_version',
    comment: 'Version of policy that was acknowledged'
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
    field: 'ip_address',
    comment: 'IP address for audit trail'
  },
  comments: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Optional comments from employee'
  }
}, {
  tableName: 'policy_acknowledgments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'idx_policy_ack_policy',
      fields: ['policy_id']
    },
    {
      name: 'idx_policy_ack_employee',
      fields: ['employee_id']
    },
    {
      name: 'idx_policy_ack_unique',
      unique: true,
      fields: ['policy_id', 'employee_id', 'policy_version']
    }
  ]
});

module.exports = PolicyAcknowledgment;
