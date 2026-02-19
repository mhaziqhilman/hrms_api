/**
 * Add employer statutory fields to companies table.
 * These fields are needed for EA Form (LHDN), EPF Borang A, SOCSO Form 8A, etc.
 *
 * Usage: node database/seeds/add-company-statutory-fields.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    const queries = [
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS e_file_no VARCHAR(30)`,
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS employer_epf_no VARCHAR(30)`,
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS employer_socso_code VARCHAR(30)`,
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS signatory_name VARCHAR(150)`,
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS signatory_position VARCHAR(100)`,
      `ALTER TABLE companies ADD COLUMN IF NOT EXISTS lhdn_branch VARCHAR(50)`,
    ];

    for (const query of queries) {
      console.log(`Running: ${query}`);
      await sequelize.query(query);
      console.log('  Done');
    }

    console.log('\nAll statutory fields added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
