/**
 * Migration: Widen invoices.payment_terms from VARCHAR(50) to TEXT
 *
 * The original 50-char cap overflows when AI extraction pulls verbose payment
 * term sentences from real invoices (e.g. "Within 3 to 5 business days upon
 * receipt of payment from Client (PETRONAS)" = 77 chars).
 *
 * Safe to re-run — checks current column type first.
 *
 * Usage:
 *   node database/seeds/widen-invoice-payment-terms.js
 */

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: process.env.DB_SSL !== 'false' ? {
      ssl: { require: true, rejectUnauthorized: false }
    } : {},
    logging: false
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false
    }
  );
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.\n');

    const [info] = await sequelize.query(`
      SELECT data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name = 'payment_terms'
    `, { type: QueryTypes.SELECT });

    if (!info) {
      console.log('  Column payment_terms does not exist on invoices — nothing to do.');
      return;
    }

    if (info.data_type === 'text') {
      console.log('  Column payment_terms is already TEXT ✓');
      return;
    }

    console.log(`  Current: ${info.data_type}(${info.character_maximum_length})`);
    console.log('  Widening payment_terms to TEXT...');
    await sequelize.query('ALTER TABLE "invoices" ALTER COLUMN "payment_terms" TYPE TEXT');
    console.log('  Done ✓');

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
