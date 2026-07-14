/**
 * Migration: Create the overtime_requests table
 *
 * Backs the Overtime approval module. Employees file OT requests, the reporting
 * manager approves/rejects, and approved OT auto-sums into payroll.overtime_pay.
 *
 * Brand-new table, so we create it via model.sync() rather than raw DDL.
 * Safe to re-run — sync() only creates the table if it doesn't exist and never
 * drops data (no { force } / { alter }).
 *
 * Usage:
 *   node database/seeds/add-overtime-table.js
 */

require('dotenv').config();
const { sequelize, Overtime } = require('../../src/models');

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.\n');

    console.log('Creating table: overtime_requests');
    await Overtime.sync();
    console.log('  overtime_requests ready ✓');

    console.log('\nMigration complete!');
    console.log('Reminder: run `node database/seeds/seed-packages.js` to add the "overtime" feature flag.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
