/**
 * Migration: Backfill public_id UUIDs for existing rows
 *
 * Run ONCE before deploying the IDOR fix to production.
 * Safe to re-run — skips rows that already have a public_id.
 *
 * Usage:
 *   node database/seeds/add-public-ids.js
 */

require('dotenv').config();
const { Sequelize, DataTypes, QueryTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

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

// Tables that need public_id backfilled
const TABLES = [
  'payroll',
  'claims',
  'leaves',
  'attendance',
  'employees',
  'memos',
  'policies'
];

async function ensureColumn(tableName) {
  const [columns] = await sequelize.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = :table AND column_name = 'public_id'
  `, {
    replacements: { table: tableName },
    type: QueryTypes.SELECT
  });

  if (!columns) {
    console.log(`  Adding public_id column to ${tableName}...`);
    await sequelize.query(`
      ALTER TABLE "${tableName}"
      ADD COLUMN IF NOT EXISTS public_id UUID UNIQUE DEFAULT gen_random_uuid()
    `);
    console.log(`  Column added to ${tableName}.`);
  } else {
    console.log(`  Column public_id already exists in ${tableName}.`);
  }
}

async function backfillTable(tableName) {
  // Find rows with NULL public_id
  const rows = await sequelize.query(
    `SELECT id FROM "${tableName}" WHERE public_id IS NULL`,
    { type: QueryTypes.SELECT }
  );

  if (rows.length === 0) {
    console.log(`  ${tableName}: all rows already have public_id ✓`);
    return;
  }

  console.log(`  ${tableName}: backfilling ${rows.length} rows...`);

  for (const row of rows) {
    await sequelize.query(
      `UPDATE "${tableName}" SET public_id = :uuid WHERE id = :id`,
      {
        replacements: { uuid: uuidv4(), id: row.id },
        type: QueryTypes.UPDATE
      }
    );
  }

  console.log(`  ${tableName}: done ✓`);
}

async function addNotNullConstraint(tableName) {
  // After backfill, add NOT NULL constraint if not already there
  const [info] = await sequelize.query(`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_name = :table AND column_name = 'public_id'
  `, {
    replacements: { table: tableName },
    type: QueryTypes.SELECT
  });

  if (info && info.is_nullable === 'YES') {
    await sequelize.query(
      `ALTER TABLE "${tableName}" ALTER COLUMN public_id SET NOT NULL`
    );
    console.log(`  ${tableName}: NOT NULL constraint set ✓`);
  }
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.\n');

    for (const table of TABLES) {
      console.log(`Processing table: ${table}`);
      await ensureColumn(table);
      await backfillTable(table);
      console.log();
    }

    console.log('All tables processed. Migration complete!');
    console.log('\nNext steps:');
    console.log('  1. Set DB_SYNC=true temporarily to sync Sequelize model changes');
    console.log('  2. Restart the server once, then set DB_SYNC=false again');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
