const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// A monthly cash-flow forecast / solvency test (e.g. "13-month solvency test").
// Rows (line items) live in cash_flow_lines; per-month amounts are JSONB arrays
// on each line. All totals (sum inflows/outflows, net, opening/closing balance)
// are computed in cashFlowService — never stored here.
const CashFlowStatement = sequelize.define('CashFlowStatement', {
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
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  // First day of the first month in the projection (e.g. 2024-05-01)
  start_month: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  // Number of monthly columns in the projection
  num_months: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 12
  },
  // Cash in hand & at bank at the start of month 1
  opening_balance: {
    type: DataTypes.DECIMAL(14, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'MYR'
  },
  status: {
    type: DataTypes.ENUM('Draft', 'Final'),
    defaultValue: 'Draft'
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
  tableName: 'cash_flow_statements',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['company_id'] },
    { fields: ['company_id', 'start_month'] }
  ]
});

module.exports = CashFlowStatement;
