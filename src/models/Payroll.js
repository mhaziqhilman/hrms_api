const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Payroll = sequelize.define('Payroll', {
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
    allowNull: false
  },
  month: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 12
    }
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // Salary Components
  basic_salary: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  allowances: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  overtime_pay: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  bonus: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  commission: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  gross_salary: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  // Deductions - Statutory
  epf_employee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  epf_employer: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  socso_employee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  socso_employer: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  eis_employee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  eis_employer: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  pcb_deduction: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  // Other Deductions
  unpaid_leave_deduction: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  other_deductions: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  total_deductions: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  // Net Pay
  net_salary: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  // Status
  status: {
    type: DataTypes.ENUM('Draft', 'Pending', 'Approved', 'Paid', 'Cancelled'),
    defaultValue: 'Draft'
  },
  payment_method: {
    type: DataTypes.ENUM('Bank Transfer', 'Cash', 'Cheque'),
    defaultValue: 'Bank Transfer'
  },
  // Metadata
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  processed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'payroll',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['employee_id', 'year', 'month']
    },
    {
      fields: ['year', 'month']
    },
    {
      fields: ['status']
    },
    {
      fields: ['payment_date']
    }
  ]
});

module.exports = Payroll;
