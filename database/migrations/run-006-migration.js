/**
 * Run migration 006: Add PCB employee fields
 * Usage: node database/migrations/run-006-migration.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function runMigration() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connected successfully.');

    const statements = [
      "ALTER TABLE employees ALTER COLUMN tax_category SET DEFAULT 'KA'",
      'ALTER TABLE employees ADD COLUMN IF NOT EXISTS number_of_children INTEGER DEFAULT 0',
      'ALTER TABLE employees ADD COLUMN IF NOT EXISTS children_in_higher_education INTEGER DEFAULT 0',
      'ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_self BOOLEAN DEFAULT false',
      'ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_spouse BOOLEAN DEFAULT false',
      'ALTER TABLE employees ADD COLUMN IF NOT EXISTS disabled_children INTEGER DEFAULT 0',
      "UPDATE employees SET tax_category = 'KA' WHERE tax_category = 'Individual' OR tax_category IS NULL"
    ];

    for (const sql of statements) {
      console.log(`Executing: ${sql.substring(0, 80)}...`);
      await sequelize.query(sql);
    }

    console.log('Migration 006 completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
