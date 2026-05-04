/**
 * Clear all data in the Finance module:
 *   - Invoice payments + invoice items + invoices  (project invoices / e-invoices)
 *   - Bill payments + bill items + bills           (POs / vendor bills / expenses)
 *   - Projects                                     (project master)
 *
 * Tables are TRUNCATEd with CASCADE + RESTART IDENTITY so that:
 *   - any unforeseen FK references are removed
 *   - SERIAL IDs reset to 1
 *
 * Other modules (employees, payroll, leave, claims, etc.) are NOT touched.
 *
 * Usage: node database/seeds/clear-finance-data.js
 *
 * To scope to a single company, set CLEAR_COMPANY_ID env var:
 *   CLEAR_COMPANY_ID=1 node database/seeds/clear-finance-data.js
 */
require('dotenv').config();
const { sequelize } = require('../../src/config/database');

async function clear() {
  const companyId = process.env.CLEAR_COMPANY_ID ? parseInt(process.env.CLEAR_COMPANY_ID, 10) : null;
  const t = await sequelize.transaction();

  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    if (companyId) {
      console.log(`Scope: company_id = ${companyId}\n`);

      // Order matters — children first, then parents
      const scopedDeletes = [
        // Invoice payments belong to invoices that belong to a company
        `DELETE FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = :cid)`,
        `DELETE FROM invoice_items    WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = :cid)`,
        `DELETE FROM invoices         WHERE company_id = :cid`,

        `DELETE FROM bill_payments    WHERE bill_id    IN (SELECT id FROM bills    WHERE company_id = :cid)`,
        `DELETE FROM bill_items       WHERE bill_id    IN (SELECT id FROM bills    WHERE company_id = :cid)`,
        `DELETE FROM bills            WHERE company_id = :cid`,

        // Projects last (invoices/bills referenced project_id)
        `DELETE FROM projects         WHERE company_id = :cid`
      ];

      for (const q of scopedDeletes) {
        console.log(`Running: ${q}`);
        const [result] = await sequelize.query(q, {
          replacements: { cid: companyId },
          transaction: t
        });
        console.log(`  Done (${result?.rowCount ?? 0} rows)`);
      }
    } else {
      console.log('Scope: ALL companies (full wipe of finance tables)\n');

      // TRUNCATE ... CASCADE clears all dependent rows in a single statement
      const tables = [
        'invoice_payments',
        'invoice_items',
        'invoices',
        'bill_payments',
        'bill_items',
        'bills',
        'projects'
      ];

      const q = `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`;
      console.log(`Running: ${q}`);
      await sequelize.query(q, { transaction: t });
      console.log('  Done');
    }

    await t.commit();
    console.log('\nFinance module data cleared successfully.');
    process.exit(0);
  } catch (error) {
    await t.rollback();
    console.error('Clear failed (transaction rolled back):', error.message);
    process.exit(1);
  }
}

clear();
