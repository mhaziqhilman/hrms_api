const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const File = sequelize.define('File', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  original_filename: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  stored_filename: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  file_path: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  file_size: {
    type: DataTypes.BIGINT,
    allowNull: false,
    comment: 'Size in bytes'
  },
  mime_type: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  file_extension: {
    type: DataTypes.STRING(10),
    allowNull: false
  },

  // Context & Categorization
  category: {
    type: DataTypes.ENUM(
      'employee_document',
      'claim_receipt',
      'payslip',
      'leave_document',
      'company_document',
      'invoice',
      'other'
    ),
    allowNull: false
  },
  sub_category: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'e.g., resume, ic_copy, medical_receipt'
  },

  // Associations
  uploaded_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'User ID'
  },
  related_to_employee_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  related_to_claim_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  related_to_leave_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  related_to_payroll_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  related_to_invoice_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },

  // File metadata
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of tags for searching'
  },
  is_public: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Public access (e.g., company policies)'
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Admin verified document'
  },

  // Lifecycle
  status: {
    type: DataTypes.ENUM('active', 'archived', 'deleted'),
    defaultValue: 'active'
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  deleted_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'files',
  timestamps: true,
  createdAt: 'uploaded_at',
  updatedAt: false,
  indexes: [
    { fields: ['category'] },
    { fields: ['related_to_employee_id'] },
    { fields: ['related_to_claim_id'] },
    { fields: ['uploaded_by'] },
    { fields: ['status'] }
  ]
});

module.exports = File;
