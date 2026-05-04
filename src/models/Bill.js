const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Bill = sequelize.define('Bill', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  public_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    allowNull: false,
    unique: true
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'companies', key: 'id' }
  },
  project_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'projects', key: 'id' }
  },
  // Internal sequential number — e.g. PO-2026-0001 / BILL-2026-0001
  bill_number: {
    type: DataTypes.STRING(30),
    allowNull: false
  },
  // Vendor's invoice number (their reference)
  vendor_invoice_number: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  bill_type: {
    type: DataTypes.ENUM('PO', 'Bill', 'Expense'),
    defaultValue: 'Bill'
  },
  bill_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  due_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  vendor_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  vendor_tin: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  vendor_address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  vendor_email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'MYR'
  },
  exchange_rate: {
    type: DataTypes.DECIMAL(10, 6),
    defaultValue: 1.000000
  },
  subtotal: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  total_tax: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  total_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  amount_paid: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  balance_due: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  status: {
    type: DataTypes.ENUM('Draft', 'Approved', 'Received', 'Partial_Paid', 'Paid', 'Cancelled'),
    defaultValue: 'Draft'
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  attachment_url: {
    type: DataTypes.STRING(500),
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
  tableName: 'bills',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['company_id', 'bill_number'] },
    { fields: ['company_id', 'status'] },
    { fields: ['company_id', 'bill_date'] },
    { fields: ['project_id'] }
  ]
});

module.exports = Bill;
