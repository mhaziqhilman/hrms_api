/**
 * Migration: Add primary_color and secondary_color columns to companies table
 * Run: node database/seeds/add-company-brand-colors.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database.');

    await sequelize.query(`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#6b21a8',
      ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#0891b2';
    `);

    console.log('Added primary_color and secondary_color columns to companies table.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
