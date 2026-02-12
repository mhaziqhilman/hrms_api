const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ClaimType = sequelize.define('ClaimType', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'companies',
      key: 'id'
    }
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  requires_receipt: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  max_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    _comment: 'Maximum amount allowed per claim (NULL means no limit)'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'claim_types',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['company_id', 'name']
    }
  ]
});

module.exports = ClaimType;
