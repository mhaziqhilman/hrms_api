/**
 * Add end_date field to employees table.
 * Stores the employee's last working day when they resign / are terminated.
 *
 * Usage: node database/seeds/add-employee-end-date.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    const query = `ALTER TABLE employees ADD COLUMN IF NOT EXISTS end_date DATE`;
    console.log(`Running: ${query}`);
    await sequelize.query(query);
    console.log('  Done');

    console.log('\nend_date field added successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
