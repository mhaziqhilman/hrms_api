const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BillPayment = sequelize.define('BillPayment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bill_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'bills', key: 'id' }
  },
  payment_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  payment_method: {
    type: DataTypes.ENUM('Bank Transfer', 'Cash', 'Cheque', 'Credit Card', 'E-Wallet', 'Other'),
    allowNull: false
  },
  reference_number: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  }
}, {
  tableName: 'bill_payments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = BillPayment;
