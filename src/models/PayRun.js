const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const PayRun = sequelize.define('PayRun', {
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
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  month: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 12 }
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  pay_period_start: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  pay_period_end: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  payment_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  total_employees: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  total_gross: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  total_deductions: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  total_net: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0
  },
  total_employer_cost: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    defaultValue: 0,
    _comment: 'Total employer statutory contributions (EPF + SOCSO + EIS)'
  },
  status: {
    type: DataTypes.ENUM('Draft', 'Pending', 'Approved', 'Paid', 'Cancelled'),
    defaultValue: 'Draft'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_by: {
    type: DataTypes.INTEGER,
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
  tableName: 'pay_runs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['company_id', 'year', 'month']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = PayRun;
