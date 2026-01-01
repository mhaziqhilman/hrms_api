const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Policy = sequelize.define('Policy', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  policy_code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'policy_code',
    comment: 'Unique policy identifier (e.g., HR-001, IT-005)'
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Brief description of the policy'
  },
  content: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
    comment: 'Full policy content (can be HTML)'
  },
  category: {
    type: DataTypes.ENUM('HR', 'IT', 'Finance', 'Safety', 'Compliance', 'Operations', 'Other'),
    allowNull: false,
    defaultValue: 'Other',
    comment: 'Policy category for organization'
  },
  version: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '1.0',
    comment: 'Policy version number'
  },
  status: {
    type: DataTypes.ENUM('Draft', 'Active', 'Archived', 'Superseded'),
    defaultValue: 'Draft',
    allowNull: false,
    comment: 'Current status of the policy'
  },
  author_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    field: 'author_id',
    comment: 'User who created the policy'
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    field: 'approved_by',
    comment: 'User who approved the policy'
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_at',
    comment: 'Timestamp when policy was approved'
  },
  effective_from: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'effective_from',
    comment: 'Date when policy becomes effective'
  },
  review_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'review_date',
    comment: 'Next scheduled review date'
  },
  expires_at: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'expires_at',
    comment: 'Optional expiry date for time-limited policies'
  },
  parent_policy_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'policies',
      key: 'id'
    },
    field: 'parent_policy_id',
    comment: 'Reference to previous version if this is an update'
  },
  requires_acknowledgment: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'requires_acknowledgment',
    comment: 'Whether employees must acknowledge reading this policy'
  },
  file_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'file_url',
    comment: 'URL to PDF or document file'
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'file_size',
    comment: 'File size in bytes'
  },
  view_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'view_count',
    comment: 'Total number of views'
  },
  acknowledgment_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'acknowledgment_count',
    comment: 'Number of employees who acknowledged'
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of tags for searching and filtering'
  }
}, {
  tableName: 'policies',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'idx_policy_code',
      unique: true,
      fields: ['policy_code']
    },
    {
      name: 'idx_policy_status',
      fields: ['status']
    },
    {
      name: 'idx_policy_category',
      fields: ['category']
    },
    {
      name: 'idx_policy_author',
      fields: ['author_id']
    },
    {
      name: 'idx_policy_effective_from',
      fields: ['effective_from']
    }
  ]
});

module.exports = Policy;
