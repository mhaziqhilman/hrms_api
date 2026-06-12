/**
 * Clear all data in the e-Invoice module:
 *   - invoice_payments
 *   - invoice_items
 *   - invoices
 *
 * Bills, projects, and every other module are NOT touched.
 *
 * Usage:
 *   Single company (recommended):  CLEAR_COMPANY_ID=1 node database/seeds/clear-einvoice-data.js
 *   All companies (full wipe):     node database/seeds/clear-einvoice-data.js
 *
 * The single-company path uses scoped DELETEs (keeps SERIAL IDs intact).
 * The full-wipe path TRUNCATEs with RESTART IDENTITY CASCADE.
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
        `DELETE FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = :cid)`,
        `DELETE FROM invoice_items    WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = :cid)`,
        `DELETE FROM invoices         WHERE company_id = :cid`
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
      console.log('Scope: ALL companies (full wipe of e-invoice tables)\n');

      const q = `TRUNCATE TABLE invoice_payments, invoice_items, invoices RESTART IDENTITY CASCADE`;
      console.log(`Running: ${q}`);
      await sequelize.query(q, { transaction: t });
      console.log('  Done');
    }

    await t.commit();
    console.log('\ne-Invoice module data cleared successfully.');
    process.exit(0);
  } catch (error) {
    await t.rollback();
    console.error('Clear failed (transaction rolled back):', error.message);
    process.exit(1);
  }
}

clear();
