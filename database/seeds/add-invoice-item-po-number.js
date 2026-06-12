/**
 * Migration: Add po_number column to invoice_items
 *
 * Supports multi-PO invoices where each line item maps to a different
 * purchase order / project (e.g. consolidated billing across deliverables).
 *
 * Safe to re-run.
 *
 * Usage:
 *   node database/seeds/add-invoice-item-po-number.js
 */

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: process.env.DB_SSL !== 'false' ? {
      ssl: { require: true, rejectUnauthorized: false }
    } : {},
    logging: false
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false
    }
  );
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.\n');

    const [existing] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'invoice_items' AND column_name = 'po_number'
    `, { type: QueryTypes.SELECT });

    if (existing) {
      console.log('  Column "po_number" already exists on invoice_items ✓');
    } else {
      console.log('  Adding "po_number" column to invoice_items...');
      await sequelize.query(`
        ALTER TABLE "invoice_items" ADD COLUMN IF NOT EXISTS "po_number" VARCHAR(50)
      `);
      console.log('  Column "po_number" added ✓');
    }

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
