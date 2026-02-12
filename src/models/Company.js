const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Company = sequelize.define('Company', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  registration_no: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
    field: 'registration_no'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  industry: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  size: {
    type: DataTypes.ENUM('1-10', '11-50', '51-200', '201-500', '500+'),
    allowNull: true
  },
  country: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'Malaysia'
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  website: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  logo_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'logo_url'
  },
  owner_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'owner_id'
  }
}, {
  tableName: 'companies',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Company;
