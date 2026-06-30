/**
 * Migration: Create cash-flow forecast tables
 *
 *   - cash_flow_statements  (one monthly forecast / solvency test)
 *   - cash_flow_lines       (inflow/outflow line items, JSONB monthly amounts)
 *
 * These are brand-new tables, so we create them via model.sync() rather than
 * raw DDL. Safe to re-run — sync() only creates a table if it doesn't exist and
 * never drops data (no { force } / { alter }).
 *
 * Usage:
 *   node database/seeds/add-cashflow-tables.js
 */

require('dotenv').config();
const { sequelize, CashFlowStatement, CashFlowLine } = require('../../src/models');

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.\n');

    console.log('Creating table: cash_flow_statements');
    await CashFlowStatement.sync();
    console.log('  cash_flow_statements ready ✓');

    console.log('Creating table: cash_flow_lines');
    await CashFlowLine.sync();
    console.log('  cash_flow_lines ready ✓');

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
