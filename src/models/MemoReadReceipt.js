const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MemoReadReceipt = sequelize.define('MemoReadReceipt', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  memo_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'memos',
      key: 'id'
    },
    field: 'memo_id',
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
  read_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'read_at',
    comment: 'Timestamp when employee viewed the memo'
  },
  acknowledged_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'acknowledged_at',
    comment: 'Timestamp when employee acknowledged the memo'
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
    field: 'ip_address',
    comment: 'IP address for audit trail'
  }
}, {
  tableName: 'memo_read_receipts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'idx_memo_read_receipt_memo',
      fields: ['memo_id']
    },
    {
      name: 'idx_memo_read_receipt_employee',
      fields: ['employee_id']
    },
    {
      name: 'idx_memo_read_receipt_unique',
      unique: true,
      fields: ['memo_id', 'employee_id']
    }
  ]
});

module.exports = MemoReadReceipt;
