/**
 * Migration 007: Add Announcement Features
 * Run with: node database/migrations/run-007-migration.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../../src/config/database');

async function runMigration() {
  try {
    console.log('Starting migration 007: Add Announcement Features...');

    const sqlFile = path.join(__dirname, '007_add_announcement_features.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Split by semicolons, strip comment-only lines from each chunk, filter empty
    const statements = sql
      .split(';')
      .map(s => {
        return s.split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
      })
      .filter(s => s.length > 0);

    for (const statement of statements) {
      try {
        console.log(`Executing: ${statement.substring(0, 80)}...`);
        await sequelize.query(statement);
        console.log('  ✓ Success');
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log(`  ⚠ Skipped (already exists): ${error.message.substring(0, 100)}`);
        } else {
          throw error;
        }
      }
    }

    console.log('\n✅ Migration 007 completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration 007 failed:', error.message);
    process.exit(1);
  }
}

runMigration();
