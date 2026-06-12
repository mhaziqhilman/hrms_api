const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InvoiceItem = sequelize.define('InvoiceItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  invoice_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'invoices', key: 'id' },
    onDelete: 'CASCADE'
  },
  item_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 3),
    defaultValue: 1.000
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  discount_rate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  tax_type: {
    type: DataTypes.ENUM('SST', 'Service Tax', 'Exempt', 'Zero Rated'),
    defaultValue: 'Exempt'
  },
  tax_rate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  tax_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  // LHDN product/service classification code
  classification_code: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  // UOM code: EA, HR, MTH, etc.
  unit_of_measurement: {
    type: DataTypes.STRING(10),
    defaultValue: 'EA'
  },
  // Per-line PO number — supports multi-PO invoices where each row maps to
  // a different purchase order / project.
  po_number: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Per-line project linkage — resolved from po_number on create/update.
  // Lets a multi-PO invoice link each row to its own project while the
  // invoice header keeps a single "primary" project_id (or none).
  project_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'projects', key: 'id' }
  }
}, {
  tableName: 'invoice_items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['invoice_id'] }
  ]
});

module.exports = InvoiceItem;
