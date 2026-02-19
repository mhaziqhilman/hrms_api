/**
 * Migration: Add reset_password_token and reset_password_expires columns to users table
 *
 * Run: node database/seeds/add-reset-password-columns.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database.');

    // Check if columns already exist
    const [results] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('reset_password_token', 'reset_password_expires')
    `);

    const existingColumns = results.map(r => r.column_name);

    if (!existingColumns.includes('reset_password_token')) {
      await sequelize.query(`
        ALTER TABLE users ADD COLUMN reset_password_token VARCHAR(255) DEFAULT NULL
      `);
      console.log('Added column: reset_password_token');
    } else {
      console.log('Column reset_password_token already exists, skipping.');
    }

    if (!existingColumns.includes('reset_password_expires')) {
      await sequelize.query(`
        ALTER TABLE users ADD COLUMN reset_password_expires TIMESTAMP WITH TIME ZONE DEFAULT NULL
      `);
      console.log('Added column: reset_password_expires');
    } else {
      console.log('Column reset_password_expires already exists, skipping.');
    }

    console.log('Migration complete.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
