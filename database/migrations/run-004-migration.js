/**
 * Run migration 004: Fix leave_types and claim_types constraints for multi-tenancy.
 * Usage: node database/migrations/run-004-migration.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function dropStandaloneUniques(tableName) {
  // Find all unique constraints/indexes on name that don't include company_id
  const [indexes] = await sequelize.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = '${tableName}'
      AND indexdef LIKE '%UNIQUE%'
      AND indexdef NOT LIKE '%company_id%'
      AND indexname != '${tableName}_pkey'
  `);

  for (const idx of indexes) {
    // Check if it's a table constraint (needs ALTER TABLE DROP CONSTRAINT)
    const [constraints] = await sequelize.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = '${tableName}'::regclass
        AND conname = '${idx.indexname}'
    `);

    if (constraints.length > 0) {
      console.log(`  Dropping constraint: ${idx.indexname}`);
      await sequelize.query(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${idx.indexname}"`);
    } else {
      console.log(`  Dropping index: ${idx.indexname}`);
      await sequelize.query(`DROP INDEX IF EXISTS "${idx.indexname}"`);
    }
  }

  return indexes.length;
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('✓ Connected to database\n');

    // ── STEP 1: Fix leave_types ──
    console.log('━━━ Fixing leave_types ━━━');
    const ltDropped = await dropStandaloneUniques('leave_types');
    console.log(`  Dropped ${ltDropped} standalone unique constraint(s)`);

    // Delete orphaned leave types
    const [, ltMeta] = await sequelize.query(`DELETE FROM leave_types WHERE company_id IS NULL`);
    console.log(`  Deleted orphaned leave types with company_id = NULL (rowCount: ${ltMeta.rowCount || 0})`);

    // Ensure composite unique index exists
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS leave_types_company_id_name
      ON leave_types (company_id, name)
    `);
    console.log('  ✓ Composite unique index (company_id, name) ensured');

    // ── STEP 2: Fix claim_types ──
    console.log('\n━━━ Fixing claim_types ━━━');

    // Add company_id column if missing
    const [ctCols] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'claim_types' AND column_name = 'company_id'
    `);
    if (ctCols.length === 0) {
      await sequelize.query(`ALTER TABLE claim_types ADD COLUMN company_id INTEGER REFERENCES companies(id)`);
      console.log('  + Added company_id column');
    } else {
      console.log('  company_id column already exists');
    }

    const ctDropped = await dropStandaloneUniques('claim_types');
    console.log(`  Dropped ${ctDropped} standalone unique constraint(s)`);

    // Delete orphaned claim types
    const [, ctMeta] = await sequelize.query(`DELETE FROM claim_types WHERE company_id IS NULL`);
    console.log(`  Deleted orphaned claim types with company_id = NULL (rowCount: ${ctMeta.rowCount || 0})`);

    // Create composite unique index
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS claim_types_company_id_name
      ON claim_types (company_id, name)
    `);
    console.log('  ✓ Composite unique index (company_id, name) ensured');

    // ── STEP 3: Verify ──
    console.log('\n━━━ Final indexes ━━━');
    const [finalLt] = await sequelize.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'leave_types'`);
    console.log('leave_types:');
    finalLt.forEach(i => console.log(`  ${i.indexname}`));

    const [finalCt] = await sequelize.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'claim_types'`);
    console.log('claim_types:');
    finalCt.forEach(i => console.log(`  ${i.indexname}`));

    console.log('\n✓ Migration 004 completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

run();
