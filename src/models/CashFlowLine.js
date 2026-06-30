const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// A single row in a cash-flow statement (one inflow or outflow line item).
// `amounts` is the projected monthly figures; `actuals` (optional) is filled by
// the "Pull actuals" feature from real Invoice/Bill/Payroll data so projected
// vs actual can sit side by side. Both arrays are length = statement.num_months.
const CashFlowLine = sequelize.define('CashFlowLine', {
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
  statement_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'cash_flow_statements', key: 'id' }
  },
  section: {
    type: DataTypes.ENUM('inflow', 'outflow'),
    allowNull: false
  },
  label: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // Where actuals are pulled from. 'manual' lines are never auto-populated.
  source: {
    type: DataTypes.ENUM('manual', 'invoice', 'bill', 'payroll', 'claim'),
    allowNull: false,
    defaultValue: 'manual'
  },
  // Optional filter for the source — e.g. a project public_id (invoice/bill)
  // or a Bill category string. NULL = all of that source for the company.
  source_ref: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  // Projected monthly figures, length = num_months
  amounts: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },
  // Actual monthly figures pulled from real data (nullable until pulled)
  actuals: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: null
  }
}, {
  tableName: 'cash_flow_lines',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['statement_id'] },
    { fields: ['statement_id', 'section'] }
  ]
});

module.exports = CashFlowLine;
