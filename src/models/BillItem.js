const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BillItem = sequelize.define('BillItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bill_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'bills', key: 'id' }
  },
  item_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 3),
    defaultValue: 1.000
  },
  unit_price: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  tax_rate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  tax_amount: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  line_subtotal: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  },
  line_total: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0.00
  }
}, {
  tableName: 'bill_items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = BillItem;
