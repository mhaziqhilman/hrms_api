const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Project = sequelize.define('Project', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  public_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    allowNull: false,
    unique: true
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'companies', key: 'id' }
  },
  code: {
    type: DataTypes.STRING(30),
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  client_name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('Planning', 'Active', 'On_Hold', 'Completed', 'Cancelled'),
    defaultValue: 'Planning'
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  end_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  budget: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'MYR'
  },
  manager_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  }
}, {
  tableName: 'projects',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['company_id', 'code'] },
    { fields: ['company_id', 'status'] }
  ]
});

module.exports = Project;
