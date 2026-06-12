/**
 * Migration: Add project_id column to invoice_items
 *
 * Per-line project linkage — supports multi-PO invoices where each line maps
 * to its own project. Resolved automatically on create/update from po_number.
 *
 * Safe to re-run.
 *
 * Usage:
 *   node database/seeds/add-invoice-item-project-id.js
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

    const [existing] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'invoice_items' AND column_name = 'project_id'
    `, { type: QueryTypes.SELECT });

    if (existing) {
      console.log('  Column "project_id" already exists on invoice_items ✓');
    } else {
      console.log('  Adding "project_id" column...');
      await sequelize.query(`
        ALTER TABLE "invoice_items"
        ADD COLUMN IF NOT EXISTS "project_id" INTEGER REFERENCES "projects"("id")
      `);
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "invoice_items_project_id_idx" ON "invoice_items"("project_id")
      `);
      console.log('  Column + index added ✓');
    }

    // Backfill existing rows where po_number is set but project_id is null
    const [{ count: needsBackfill }] = await sequelize.query(`
      SELECT COUNT(*)::int AS count
      FROM "invoice_items" ii
      WHERE ii."po_number" IS NOT NULL AND ii."project_id" IS NULL
    `, { type: QueryTypes.SELECT });

    if (needsBackfill > 0) {
      console.log(`\n  Backfilling ${needsBackfill} item(s) with project_id from po_number...`);
      const [result] = await sequelize.query(`
        UPDATE "invoice_items" ii
        SET "project_id" = p."id"
        FROM "projects" p
        JOIN "invoices" inv ON inv."id" = ii."invoice_id"
        WHERE ii."po_number" IS NOT NULL
          AND ii."project_id" IS NULL
          AND p."po_number" = ii."po_number"
          AND p."company_id" = inv."company_id"
        RETURNING ii."id"
      `, { type: QueryTypes.RAW });
      console.log(`  Backfilled ${Array.isArray(result) ? result.length : 0} item(s) ✓`);
    } else {
      console.log('\n  No backfill needed.');
    }

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
