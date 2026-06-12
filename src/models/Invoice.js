const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Invoice = sequelize.define('Invoice', {
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
  project_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'projects', key: 'id' }
  },
  invoice_number: {
    type: DataTypes.STRING(30),
    allowNull: false
  },
  // Optional manual title/reference — used mainly for "Recorded" invoices
  // (old invoices entered for record-keeping, never submitted to LHDN).
  title: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  invoice_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  due_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  // Service / activity period the invoice covers — distinct from invoice_date,
  // which is just the issue/printing date. Many service invoices are backdated
  // or post-dated relative to the month of work being billed.
  commence_date_start: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  commence_date_end: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  // 01=Invoice, 02=Credit Note, 03=Debit Note, 04=Refund Note
  invoice_type: {
    type: DataTypes.ENUM('01', '02', '03', '04'),
    allowNull: false,
    defaultValue: '01'
  },
  is_self_billed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'MYR'
  },
  exchange_rate: {
    type: DataTypes.DECIMAL(10, 6),
    defaultValue: 1.000000
  },
  payment_terms: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  // Supplier Info
  supplier_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  supplier_tin: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  supplier_brn: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  supplier_sst_no: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  supplier_address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  supplier_phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  supplier_email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  supplier_msic_code: {
    type: DataTypes.STRING(10),
    allowNull: true
  },

  // Buyer Info
  buyer_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  buyer_tin: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  buyer_brn: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  buyer_address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  buyer_phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  buyer_email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },

  // Totals
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  total_discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  total_tax: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  amount_paid: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  balance_due: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },

  // LHDN Tracking
  lhdn_uuid: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true
  },
  lhdn_long_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  lhdn_submission_uid: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  lhdn_status: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  lhdn_submitted_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lhdn_validated_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lhdn_qr_url: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  lhdn_validation_errors: {
    type: DataTypes.JSONB,
    allowNull: true
  },

  // Status & Workflow
  // 'Recorded' = manually entered for record-keeping only; never submitted to LHDN.
  status: {
    type: DataTypes.ENUM('Draft', 'Pending', 'Submitted', 'Valid', 'Invalid', 'Cancelled', 'Superseded', 'Recorded'),
    defaultValue: 'Draft'
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelled_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  },
  cancelled_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancellation_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  // Source Linkage
  source_type: {
    type: DataTypes.ENUM('manual', 'payroll', 'claim'),
    allowNull: true
  },
  source_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },

  // Audit
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  }
}, {
  tableName: 'invoices',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['company_id', 'status'] },
    { unique: true, fields: ['company_id', 'invoice_number'] },
    { fields: ['company_id', 'invoice_date'] },
    { fields: ['source_type', 'source_id'] },
    { fields: ['project_id'] }
  ]
});

module.exports = Invoice;
