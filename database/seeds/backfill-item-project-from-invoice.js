/**
 * Backfill: For existing invoice_items that have NULL project_id but whose
 * parent invoice has a project_id, inherit it. Handles invoices created
 * before the per-line project_id resolver was wired up, or single-PO invoices
 * where the AI extracted PO only at header level.
 *
 * Safe to re-run.
 *
 * Usage:
 *   node database/seeds/backfill-item-project-from-invoice.js
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

    const [{ count: needsBackfill }] = await sequelize.query(`
      SELECT COUNT(*)::int AS count
      FROM "invoice_items" ii
      JOIN "invoices" inv ON inv."id" = ii."invoice_id"
      WHERE ii."project_id" IS NULL
        AND inv."project_id" IS NOT NULL
    `, { type: QueryTypes.SELECT });

    if (needsBackfill === 0) {
      console.log('  No backfill needed — all items with a parent project already linked ✓');
      return;
    }

    console.log(`  Backfilling ${needsBackfill} line item(s) from invoice.project_id...`);
    const [, meta] = await sequelize.query(`
      UPDATE "invoice_items" ii
      SET "project_id" = inv."project_id"
      FROM "invoices" inv
      WHERE ii."invoice_id" = inv."id"
        AND ii."project_id" IS NULL
        AND inv."project_id" IS NOT NULL
    `);
    console.log(`  Updated ${meta?.rowCount ?? needsBackfill} row(s) ✓`);

    console.log('\nBackfill complete!');
  } catch (error) {
    console.error('Backfill failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
