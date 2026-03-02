const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EmailConfiguration = sequelize.define('EmailConfiguration', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'companies',
      key: 'id'
    }
  },
  smtp_host: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  smtp_port: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 587
  },
  smtp_secure: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  smtp_user: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  smtp_password: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  from_name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  from_email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
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
  tableName: 'email_configurations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = EmailConfiguration;
