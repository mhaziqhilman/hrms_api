/**
 * Migration 008: Add status field to user_companies table
 * Run with: node database/migrations/run-008-migration.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function runMigration() {
  try {
    console.log('Starting migration 008: Add user_company status field...');

    // Step 1: Create ENUM type if not exists
    console.log('Step 1: Creating ENUM type...');
    try {
      await sequelize.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_user_companies_status') THEN
            CREATE TYPE enum_user_companies_status AS ENUM ('active', 'inactive');
          END IF;
        END $$
      `);
      console.log('  Success');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('  Skipped (already exists)');
      } else {
        throw error;
      }
    }

    // Step 2: Add status column
    console.log('Step 2: Adding status column...');
    try {
      await sequelize.query(`
        ALTER TABLE user_companies
        ADD COLUMN IF NOT EXISTS status enum_user_companies_status NOT NULL DEFAULT 'active'
      `);
      console.log('  Success');
    } catch (error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.log('  Skipped (already exists)');
      } else {
        throw error;
      }
    }

    // Step 3: Backfill existing records
    console.log('Step 3: Backfilling existing records...');
    const [, meta] = await sequelize.query(`
      UPDATE user_companies SET status = 'active' WHERE status IS NULL
    `);
    console.log(`  Success (${meta?.rowCount || 0} rows updated)`);

    console.log('\nMigration 008 completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\nMigration 008 failed:', error.message);
    process.exit(1);
  }
}

runMigration();
