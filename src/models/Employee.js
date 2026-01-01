const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Employee = sequelize.define('Employee', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
    references: {
      model: 'users',
      key: 'id'
    },
    field: 'user_id'
  },
  // Employee Information
  employee_id: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    field: 'employee_id'
  },
  full_name: {
    type: DataTypes.STRING(150),
    allowNull: false,
    field: 'full_name'
  },
  ic_no: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true,
    field: 'ic_no'
  },
  passport_no: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'passport_no'
  },
  date_of_birth: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'date_of_birth'
  },
  gender: {
    type: DataTypes.ENUM('Male', 'Female'),
    allowNull: false
  },
  marital_status: {
    type: DataTypes.ENUM('Single', 'Married', 'Divorced', 'Widowed'),
    allowNull: true,
    field: 'marital_status'
  },
  nationality: {
    type: DataTypes.STRING(50),
    defaultValue: 'Malaysian'
  },
  race: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  religion: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Contact Information
  mobile: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  emergency_contact_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'emergency_contact_name'
  },
  emergency_contact_phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'emergency_contact_phone'
  },
  current_address: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'current_address'
  },
  permanent_address: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'permanent_address'
  },
  // Employment Information
  position: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  department: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  reporting_manager_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'employees',
      key: 'id'
    },
    field: 'reporting_manager_id'
  },
  basic_salary: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'basic_salary'
  },
  join_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'join_date'
  },
  confirmation_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'confirmation_date'
  },
  employment_type: {
    type: DataTypes.ENUM('Permanent', 'Contract', 'Probation', 'Intern'),
    allowNull: true,
    defaultValue: 'Probation',
    field: 'employment_type'
  },
  employment_status: {
    type: DataTypes.ENUM('Active', 'Resigned', 'Terminated'),
    defaultValue: 'Active',
    field: 'employment_status'
  },
  work_location: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'work_location'
  },
  // Banking Information
  bank_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'bank_name'
  },
  bank_account_no: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'bank_account_no'
  },
  bank_account_holder: {
    type: DataTypes.STRING(150),
    allowNull: true,
    field: 'bank_account_holder'
  },
  // Statutory Information
  epf_no: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'epf_no'
  },
  socso_no: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'socso_no'
  },
  tax_no: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'tax_no'
  },
  tax_category: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'Individual',
    field: 'tax_category'
  },
  // Profile
  photo_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'photo_url'
  }
}, {
  tableName: 'employees',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Employee;
