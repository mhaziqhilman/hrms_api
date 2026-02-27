/**
 * Update employee TIN (tax_no) from LHDN data.
 * Matches employees by name (case-insensitive) and updates tax_no field.
 *
 * Usage: node database/seeds/update-employee-tin.js
 */
require('dotenv').config();
const { sequelize, Employee } = require('../../src/models');
const { Op } = require('sequelize');

const COMPANY_ID = 1;

// TIN data from LHDN
const tinData = [
  { name: 'ABDUL MUHAIMIN BIN ZULKIFLI', tin: 'IG 56885054080' },
  { name: 'AINAA RASYIDAH BINTI HASHIM', tin: 'IG 28414695010' },
  { name: 'AMMAR BIN AMRAN', tin: 'IG 26001748050' },
  { name: 'FATIMAH BINTI MAJENIN', tin: 'IG 26846075020' },
  { name: 'MOHAMMAD AMIER AKRAM BIN MOHD ZAKI', tin: 'IG 26067270100' },
  { name: 'MUHAMAD AKRAM HAKIM BIN JAMALUDIN', tin: 'IG 26846069080' },
  { name: 'MUHAMMAD BIN TAIB', tin: 'IG 57687541040' },
  { name: 'SHAHRULNIZAM BIN IBRAHIM', tin: 'IG 28794626060' },
  { name: 'UNGKU MOHAMED ISMAIL ADRIAN BIN UNGKU ABDUL RAHMAN', tin: 'IG 40138858010' },
];

async function updateTIN() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    let updated = 0;
    let notFound = 0;

    for (const { name, tin } of tinData) {
      // Case-insensitive name match
      const employee = await Employee.findOne({
        where: {
          company_id: COMPANY_ID,
          full_name: { [Op.iLike]: name }
        }
      });

      if (employee) {
        await employee.update({ tax_no: tin });
        console.log(`  + Updated: ${employee.full_name} → ${tin}`);
        updated++;
      } else {
        console.log(`  ! Not found: ${name}`);
        notFound++;
      }
    }

    console.log(`\n------------------------------------`);
    console.log(`TIN update complete!`);
    console.log(`  Updated:   ${updated}`);
    console.log(`  Not found: ${notFound}`);
    console.log(`------------------------------------\n`);

    process.exit(0);
  } catch (error) {
    console.error('Update failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

updateTIN();
