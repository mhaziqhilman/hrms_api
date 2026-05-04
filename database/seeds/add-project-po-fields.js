/**
 * Add Purchase Order fields to projects table.
 * Used when a project originates from a client PO (sub-contractor flow).
 *
 * Usage: node database/seeds/add-project-po-fields.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    const statements = [
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_number VARCHAR(60)`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_date DATE`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_value DECIMAL(12,2)`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_currency VARCHAR(3) DEFAULT 'MYR'`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_duration_months INTEGER`,
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_document_url TEXT`
    ];

    for (const q of statements) {
      console.log(`Running: ${q}`);
      await sequelize.query(q);
      console.log('  Done');
    }

    console.log('\nProject PO fields added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
