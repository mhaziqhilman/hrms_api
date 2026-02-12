/**
 * Run migration 005: Fix employees table unique constraints for multi-tenancy.
 * Usage: node database/migrations/run-005-migration.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function dropStandaloneUniques(tableName) {
  const [indexes] = await sequelize.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = '${tableName}'
      AND indexdef LIKE '%UNIQUE%'
      AND indexdef NOT LIKE '%company_id%'
      AND indexname != '${tableName}_pkey'
  `);

  for (const idx of indexes) {
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
    console.log('Connected to database\n');

    // ── STEP 1: Drop standalone unique constraints on employees ──
    console.log('--- Fixing employees unique constraints ---');
    const dropped = await dropStandaloneUniques('employees');
    console.log(`  Dropped ${dropped} standalone unique constraint(s)`);

    // ── STEP 2: Add composite unique indexes ──
    console.log('\n--- Adding composite unique indexes ---');

    // Unique ic_no per company (partial index - only when ic_no is not null)
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_ic_no_company
      ON employees (ic_no, company_id)
      WHERE ic_no IS NOT NULL
    `);
    console.log('  + unique_ic_no_company (ic_no, company_id) ensured');

    // Unique employee_id per company
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_employee_id_company
      ON employees (employee_id, company_id)
    `);
    console.log('  + unique_employee_id_company (employee_id, company_id) ensured');

    // Unique user_id per company (partial index - only when user_id is not null)
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_user_company_employee
      ON employees (user_id, company_id)
      WHERE user_id IS NOT NULL
    `);
    console.log('  + unique_user_company_employee (user_id, company_id) ensured');

    // ── STEP 3: Verify ──
    console.log('\n--- Final indexes on employees ---');
    const [finalIndexes] = await sequelize.query(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'employees'
      ORDER BY indexname
    `);
    finalIndexes.forEach(i => console.log(`  ${i.indexname}: ${i.indexdef}`));

    console.log('\nMigration 005 completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\nMigration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

run();
