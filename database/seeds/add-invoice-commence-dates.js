/**
 * Migration: Add commence_date_start + commence_date_end columns to invoices
 *
 * Service/activity period the invoice covers — distinct from the invoice
 * issue date, which is often backdated or post-dated relative to the work
 * being billed.
 *
 * Also backfills a known invoice (VTX-INV-CSV-MS-25-02) that was imported
 * before these columns existed:
 *   commence_date_start = 2025-02-01
 *   commence_date_end   = 2025-02-28
 *
 * Safe to re-run.
 *
 * Usage:
 *   node database/seeds/add-invoice-commence-dates.js
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

async function addColumnIfMissing(name) {
  const [existing] = await sequelize.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = :name
  `, { replacements: { name }, type: QueryTypes.SELECT });

  if (existing) {
    console.log(`  Column "${name}" already exists ✓`);
    return;
  }

  console.log(`  Adding "${name}" column...`);
  await sequelize.query(`ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "${name}" DATE`);
  console.log(`  Column "${name}" added ✓`);
}

async function backfillVtxInvoice() {
  const targetInvoiceNumber = 'VTX-INV-CSV-MS-25-02';

  const [row] = await sequelize.query(
    `SELECT id, commence_date_start, commence_date_end FROM "invoices" WHERE "invoice_number" = :num`,
    { replacements: { num: targetInvoiceNumber }, type: QueryTypes.SELECT }
  );

  if (!row) {
    console.log(`  Invoice ${targetInvoiceNumber} not found — skipping backfill.`);
    return;
  }

  if (row.commence_date_start && row.commence_date_end) {
    console.log(`  Invoice ${targetInvoiceNumber} already has commence dates ✓`);
    return;
  }

  await sequelize.query(
    `UPDATE "invoices"
     SET "commence_date_start" = '2025-02-01', "commence_date_end" = '2025-02-28'
     WHERE "invoice_number" = :num`,
    { replacements: { num: targetInvoiceNumber }, type: QueryTypes.UPDATE }
  );
  console.log(`  Backfilled ${targetInvoiceNumber} → 2025-02-01 to 2025-02-28 ✓`);
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.\n');

    console.log('Processing table: invoices');
    await addColumnIfMissing('commence_date_start');
    await addColumnIfMissing('commence_date_end');

    console.log('\nBackfilling known invoice...');
    await backfillVtxInvoice();

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
