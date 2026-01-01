const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ClaimType = sequelize.define('ClaimType', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  requires_receipt: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether receipt is mandatory for this claim type'
  },
  max_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Maximum amount allowed per claim (NULL means no limit)'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'claim_types',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ClaimType;
