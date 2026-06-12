/**
 * Migration: Add `title` column + `Recorded` status to the invoices table
 *
 * Supports the "Recorded" invoice feature — old/external invoices that are
 * logged for record-keeping only and never submitted to LHDN.
 *
 * Run ONCE against the database. Safe to re-run — every step is idempotent.
 *
 * Usage:
 *   node database/seeds/add-invoice-title-recorded.js
 */

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

// --- DB connection (mirrors config/database.js) ---
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

async function addTitleColumn() {
  const [existing] = await sequelize.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'title'
  `, { type: QueryTypes.SELECT });

  if (existing) {
    console.log('  Column "title" already exists on invoices ✓');
    return;
  }

  console.log('  Adding "title" column to invoices...');
  await sequelize.query(`
    ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "title" VARCHAR(255)
  `);
  console.log('  Column "title" added ✓');
}

async function addRecordedStatus() {
  // Sequelize names ENUM types as enum_<table>_<column>
  const enumType = 'enum_invoices_status';

  const [existing] = await sequelize.query(`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = :enumType AND e.enumlabel = 'Recorded'
  `, { replacements: { enumType }, type: QueryTypes.SELECT });

  if (existing) {
    console.log('  Status value "Recorded" already exists ✓');
    return;
  }

  console.log('  Adding "Recorded" value to the status enum...');
  // ADD VALUE cannot run inside a transaction block — sequelize.query
  // runs in autocommit mode here, so this is safe.
  await sequelize.query(`
    ALTER TYPE "${enumType}" ADD VALUE IF NOT EXISTS 'Recorded'
  `);
  console.log('  Status value "Recorded" added ✓');
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.\n');

    console.log('Processing table: invoices');
    await addTitleColumn();
    await addRecordedStatus();

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
