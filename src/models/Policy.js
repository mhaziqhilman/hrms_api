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
    field: 'policy_code'
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  content: {
    type: DataTypes.TEXT('long'),
    allowNull: false
  },
  category: {
    type: DataTypes.ENUM('HR', 'IT', 'Finance', 'Safety', 'Compliance', 'Operations', 'Other'),
    allowNull: false,
    defaultValue: 'Other'
  },
  version: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '1.0'
  },
  status: {
    type: DataTypes.ENUM('Draft', 'Active', 'Archived', 'Superseded'),
    defaultValue: 'Draft',
    allowNull: false
  },
  author_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    field: 'author_id'
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    field: 'approved_by'
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_at'
  },
  effective_from: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'effective_from'
  },
  review_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'review_date'
  },
  expires_at: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'expires_at'
  },
  parent_policy_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'policies',
      key: 'id'
    },
    field: 'parent_policy_id'
  },
  requires_acknowledgment: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'requires_acknowledgment'
  },
  file_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'file_url'
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'file_size'
  },
  view_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'view_count'
  },
  acknowledgment_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'acknowledgment_count'
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true
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
