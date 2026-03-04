const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'companies', key: 'id' }
  },
  // e.g. 'leave.approved', 'user.role_changed', 'payroll.deleted'
  action: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  // e.g. 'Leave', 'User', 'Payroll', 'Claim'
  entity_type: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  entity_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  old_values: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  new_values: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  user_agent: {
    type: DataTypes.STRING(500),
    allowNull: true
  }
}, {
  tableName: 'audit_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { name: 'idx_audit_user', fields: ['user_id'] },
    { name: 'idx_audit_company', fields: ['company_id'] },
    { name: 'idx_audit_action', fields: ['action'] },
    { name: 'idx_audit_entity', fields: ['entity_type', 'entity_id'] },
    { name: 'idx_audit_created', fields: ['created_at'] }
  ]
});

module.exports = AuditLog;
