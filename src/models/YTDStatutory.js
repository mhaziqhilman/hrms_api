const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const YTDStatutory = sequelize.define('YTDStatutory', {
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
  year: {
    type: DataTypes.INTEGER,
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
  // Salary totals
  gross_salary: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  net_salary: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  // EPF Contributions
  employee_epf: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  employer_epf: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  total_epf: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  // SOCSO Contributions
  employee_socso: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  employer_socso: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  total_socso: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  // EIS Contributions
  employee_eis: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  employer_eis: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  total_eis: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  // PCB Tax
  pcb_deduction: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  // YTD Totals
  ytd_gross: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  ytd_net: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  ytd_employee_epf: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  ytd_employer_epf: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  ytd_employee_socso: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  ytd_employer_socso: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  ytd_employee_eis: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  ytd_employer_eis: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  ytd_pcb: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  }
}, {
  tableName: 'ytd_statutory',
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
    }
  ]
});

module.exports = YTDStatutory;
