/**
 * Add employer_phone field to companies table.
 * Used on EA Forms for "No. Telefon Majikan" (employer contact number).
 *
 * Usage: node database/seeds/add-employer-phone-field.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    const query = `ALTER TABLE companies ADD COLUMN IF NOT EXISTS employer_phone VARCHAR(20)`;
    console.log(`Running: ${query}`);
    await sequelize.query(query);
    console.log('  Done');

    console.log('\nemployer_phone field added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
