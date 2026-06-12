/**
 * Data fix: correct project dates shifted back 1 day by a timezone bug
 *
 * Background:
 *   The project form's `formatDateToString()` used `toISOString()`, which
 *   converts a locally-picked date to UTC. In Malaysia (UTC+8) a local
 *   midnight date became 16:00 UTC of the *previous* day, so every
 *   start_date / end_date / po_date was saved one day too early.
 *   The form code is now fixed — this script repairs the data already saved.
 *
 * What it does:
 *   Shifts start_date, end_date and po_date on the `projects` table
 *   forward by exactly 1 day. NULL dates are left untouched.
 *
 * Safety:
 *   - Dry-run by default: prints a before/after preview and changes nothing.
 *   - `--apply` commits the change inside a transaction and writes a receipt
 *     file (.fix-project-dates-applied.json) recording every old/new value.
 *   - Re-running `--apply` is refused once the receipt exists (guards against
 *     a double shift). Use `--force` only if you really mean it.
 *   - `--rollback` restores the exact pre-fix values from the receipt.
 *
 * Usage (run from the HRMS-API_v1 directory):
 *   node database/seeds/fix-project-dates-timezone.js                 # preview
 *   node database/seeds/fix-project-dates-timezone.js --apply         # apply
 *   node database/seeds/fix-project-dates-timezone.js --apply --company-id=3
 *   node database/seeds/fix-project-dates-timezone.js --rollback      # undo
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
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

// --- CLI args ---
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const ROLLBACK = process.argv.includes('--rollback');
const companyArg = process.argv.find(a => a.startsWith('--company-id='));
const companyId = companyArg ? parseInt(companyArg.split('=')[1], 10) : null;

const RECEIPT_PATH = path.join(__dirname, '.fix-project-dates-applied.json');
const DATE_COLS = ['start_date', 'end_date', 'po_date'];

// Add one calendar day to a 'YYYY-MM-DD' string (UTC math — no tz drift).
function addOneDay(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmt(v) { return v == null ? '—' : String(v); }

async function fetchProjects() {
  const where = companyId ? 'WHERE company_id = :companyId' : '';
  return sequelize.query(
    `SELECT id, company_id, code, name, start_date, end_date, po_date
       FROM projects ${where}
       ORDER BY company_id, id`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );
}

function printTable(rows, getBefore, getAfter) {
  console.log(
    '  ' +
    'CODE'.padEnd(16) + 'START'.padEnd(26) + 'END'.padEnd(26) + 'PO DATE'
  );
  console.log('  ' + '-'.repeat(82));
  for (const r of rows) {
    const b = getBefore(r);
    const a = getAfter(r);
    const cell = (col) => `${fmt(b[col])} → ${fmt(a[col])}`;
    console.log(
      '  ' +
      String(r.code || '').padEnd(16) +
      cell('start_date').padEnd(26) +
      cell('end_date').padEnd(26) +
      cell('po_date')
    );
  }
}

async function doApply() {
  if (fs.existsSync(RECEIPT_PATH) && !FORCE) {
    console.error('\n✖ A receipt already exists — this fix appears to have been applied:');
    console.error(`  ${RECEIPT_PATH}`);
    console.error('  Re-applying would shift dates a SECOND day forward.');
    console.error('  Use --rollback to undo, or --force to apply anyway.\n');
    process.exit(1);
  }

  const rows = await fetchProjects();
  if (rows.length === 0) {
    console.log('No projects found — nothing to fix.');
    return;
  }

  // Build the receipt before mutating so a rollback is always possible.
  const receipt = {
    appliedAt: new Date().toISOString(),
    direction: '+1 day',
    companyIdFilter: companyId,
    projects: rows.map(r => ({
      id: r.id,
      code: r.code,
      before: { start_date: r.start_date, end_date: r.end_date, po_date: r.po_date },
      after: {
        start_date: addOneDay(r.start_date),
        end_date: addOneDay(r.end_date),
        po_date: addOneDay(r.po_date)
      }
    }))
  };

  console.log(`Applying +1 day to ${rows.length} project(s)...\n`);
  printTable(rows, r => receipt.projects.find(p => p.id === r.id).before,
                   r => receipt.projects.find(p => p.id === r.id).after);

  const t = await sequelize.transaction();
  try {
    const where = companyId ? 'WHERE company_id = :companyId' : '';
    // date + 1 keeps the column as a DATE in PostgreSQL; NULL + 1 stays NULL.
    await sequelize.query(
      `UPDATE projects
          SET start_date = start_date + 1,
              end_date   = end_date + 1,
              po_date    = po_date + 1
        ${where}`,
      { replacements: { companyId }, transaction: t }
    );
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  fs.writeFileSync(RECEIPT_PATH, JSON.stringify(receipt, null, 2));
  console.log(`\n✓ Done. ${rows.length} project(s) corrected.`);
  console.log(`  Receipt written to ${RECEIPT_PATH}`);
  console.log('  Keep this file — it allows --rollback if anything looks wrong.');
}

async function doRollback() {
  if (!fs.existsSync(RECEIPT_PATH)) {
    console.error('\n✖ No receipt file found — nothing to roll back.');
    console.error(`  Expected: ${RECEIPT_PATH}\n`);
    process.exit(1);
  }
  const receipt = JSON.parse(fs.readFileSync(RECEIPT_PATH, 'utf8'));
  console.log(`Rolling back ${receipt.projects.length} project(s) to pre-fix values...\n`);

  const t = await sequelize.transaction();
  try {
    for (const p of receipt.projects) {
      await sequelize.query(
        `UPDATE projects
            SET start_date = :start_date, end_date = :end_date, po_date = :po_date
          WHERE id = :id`,
        { replacements: { id: p.id, ...p.before }, transaction: t }
      );
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  fs.renameSync(RECEIPT_PATH, RECEIPT_PATH + '.rolledback');
  console.log('✓ Rollback complete. Receipt archived as .fix-project-dates-applied.json.rolledback');
}

async function doDryRun() {
  const rows = await fetchProjects();
  if (rows.length === 0) {
    console.log('No projects found.');
    return;
  }
  console.log(`DRY RUN — ${rows.length} project(s) would be shifted +1 day. No changes made.\n`);
  printTable(
    rows,
    r => ({ start_date: r.start_date, end_date: r.end_date, po_date: r.po_date }),
    r => ({
      start_date: addOneDay(r.start_date),
      end_date: addOneDay(r.end_date),
      po_date: addOneDay(r.po_date)
    })
  );
  console.log('\nReview the START/END/PO columns above (current → corrected).');
  console.log('When it looks right, re-run with --apply to commit.');
}

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');
    if (companyId) console.log(`Scope: company_id = ${companyId}`);
    console.log();

    if (ROLLBACK) await doRollback();
    else if (APPLY) await doApply();
    else await doDryRun();
  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

run();
