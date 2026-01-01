const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Memo = sequelize.define('Memo', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT('long'),
    allowNull: false,
    comment: 'Rich text content (HTML)'
  },
  summary: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Brief summary for list view'
  },
  author_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    field: 'author_id',
    comment: 'User who created the memo'
  },
  status: {
    type: DataTypes.ENUM('Draft', 'Published', 'Archived'),
    defaultValue: 'Draft',
    allowNull: false,
    comment: 'Publication status'
  },
  priority: {
    type: DataTypes.ENUM('Low', 'Normal', 'High', 'Urgent'),
    defaultValue: 'Normal',
    allowNull: false,
    comment: 'Priority level for display'
  },
  target_audience: {
    type: DataTypes.ENUM('All', 'Department', 'Position', 'Specific'),
    defaultValue: 'All',
    allowNull: false,
    field: 'target_audience',
    comment: 'Who can see this memo'
  },
  target_departments: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'target_departments',
    comment: 'Array of department names if target_audience is Department'
  },
  target_positions: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'target_positions',
    comment: 'Array of position names if target_audience is Position'
  },
  target_employee_ids: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'target_employee_ids',
    comment: 'Array of employee IDs if target_audience is Specific'
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'published_at',
    comment: 'Timestamp when memo was published'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at',
    comment: 'Optional expiry date for temporary announcements'
  },
  requires_acknowledgment: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_acknowledgment',
    comment: 'Whether employees must acknowledge reading this memo'
  },
  attachment_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'attachment_count',
    comment: 'Number of file attachments'
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
  }
}, {
  tableName: 'memos',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'idx_memo_status',
      fields: ['status']
    },
    {
      name: 'idx_memo_author',
      fields: ['author_id']
    },
    {
      name: 'idx_memo_published_at',
      fields: ['published_at']
    },
    {
      name: 'idx_memo_priority',
      fields: ['priority']
    }
  ]
});

module.exports = Memo;
