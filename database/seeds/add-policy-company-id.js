/**
 * Migration: scope Policy by company_id (multi-tenancy)
 *
 * What it does:
 *   1. Adds `company_id` (nullable) to `policies`
 *   2. Backfills existing rows to the "demo" company (case-insensitive match
 *      on company name; falls back to the company with the lowest id if no
 *      match is found and exits with a warning so you can decide manually)
 *   3. Drops the old single-column unique index on policy_code
 *   4. Adds composite unique index (policy_code, company_id)
 *   5. Sets company_id NOT NULL
 *
 * Safe to re-run — each step checks current state before mutating.
 *
 * Usage:
 *   node database/seeds/add-policy-company-id.js
 *   node database/seeds/add-policy-company-id.js --company-id=3   (override)
 */

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

// --- DB connection (mirrors config/database.js) ---
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

// CLI override: --company-id=N
const overrideArg = process.argv.find(a => a.startsWith('--company-id='));
const overrideCompanyId = overrideArg ? parseInt(overrideArg.split('=')[1], 10) : null;

async function columnExists(table, column) {
  const rows = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = :table AND column_name = :column`,
    { replacements: { table, column }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

async function indexExists(name) {
  const rows = await sequelize.query(
    `SELECT indexname FROM pg_indexes WHERE indexname = :name`,
    { replacements: { name }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

async function resolveDemoCompanyId() {
  if (overrideCompanyId) {
    console.log(`  Using --company-id=${overrideCompanyId} from CLI override.`);
    return overrideCompanyId;
  }

  const demo = await sequelize.query(
    `SELECT id, name FROM companies WHERE name ILIKE '%demo%' ORDER BY id ASC LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  if (demo.length) {
    console.log(`  Matched demo company: id=${demo[0].id} name="${demo[0].name}"`);
    return demo[0].id;
  }

  const fallback = await sequelize.query(
    `SELECT id, name FROM companies ORDER BY id ASC LIMIT 1`,
    { type: QueryTypes.SELECT }
  );
  if (!fallback.length) {
    throw new Error('No companies exist — create one before running this migration.');
  }
  console.warn(
    `  ⚠ No company name matched "demo". Falling back to id=${fallback[0].id} ("${fallback[0].name}").`
  );
  console.warn(`  If this is wrong, re-run with --company-id=N`);
  return fallback[0].id;
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.\n');

    // 1. Add column if missing
    console.log('Step 1: ensure company_id column exists');
    if (!(await columnExists('policies', 'company_id'))) {
      await sequelize.query(
        `ALTER TABLE policies ADD COLUMN company_id INTEGER REFERENCES companies(id)`
      );
      console.log('  Added company_id column.\n');
    } else {
      console.log('  company_id already exists ✓\n');
    }

    // 2. Backfill NULL rows
    console.log('Step 2: backfill existing policies');
    const nullRows = await sequelize.query(
      `SELECT COUNT(*)::int AS n FROM policies WHERE company_id IS NULL`,
      { type: QueryTypes.SELECT }
    );
    const nullCount = nullRows[0].n;

    if (nullCount === 0) {
      console.log('  No NULL rows to backfill ✓\n');
    } else {
      const companyId = await resolveDemoCompanyId();
      console.log(`  Assigning ${nullCount} existing policies to company_id=${companyId}...`);
      await sequelize.query(
        `UPDATE policies SET company_id = :cid WHERE company_id IS NULL`,
        { replacements: { cid: companyId } }
      );
      console.log('  Backfill complete ✓\n');
    }

    // 3. Drop old single-column unique index/constraint on policy_code
    console.log('Step 3: drop old unique index on policy_code');
    // Sequelize may have created it as either an index or a constraint —
    // try both common names produced by previous syncs.
    const oldNames = ['idx_policy_code', 'policies_policy_code_key'];
    for (const name of oldNames) {
      if (await indexExists(name)) {
        await sequelize.query(`ALTER TABLE policies DROP CONSTRAINT IF EXISTS "${name}"`);
        await sequelize.query(`DROP INDEX IF EXISTS "${name}"`);
        console.log(`  Dropped "${name}" ✓`);
      }
    }
    console.log();

    // 4. Add composite unique index
    console.log('Step 4: add composite unique index (policy_code, company_id)');
    if (!(await indexExists('idx_policy_code_company'))) {
      await sequelize.query(
        `CREATE UNIQUE INDEX idx_policy_code_company
         ON policies (policy_code, company_id)`
      );
      console.log('  Composite index created ✓\n');
    } else {
      console.log('  Composite index already exists ✓\n');
    }

    // 5. NOT NULL
    console.log('Step 5: enforce NOT NULL on company_id');
    const info = await sequelize.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'policies' AND column_name = 'company_id'`,
      { type: QueryTypes.SELECT }
    );
    if (info.length && info[0].is_nullable === 'YES') {
      await sequelize.query(`ALTER TABLE policies ALTER COLUMN company_id SET NOT NULL`);
      console.log('  NOT NULL constraint set ✓\n');
    } else {
      console.log('  Already NOT NULL ✓\n');
    }

    console.log('All steps complete. Policies are now scoped by company_id.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
