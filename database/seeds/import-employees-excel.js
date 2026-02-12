/**
 * Import employees from Excel file into the database.
 * Reads Full_Details_Staff.xlsx and populates the employees table.
 * Skips employees that already exist (matched by employee_id + company_id).
 *
 * Usage: node database/seeds/import-employees-excel.js
 */
require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const { sequelize, Employee } = require('../../src/models');

// ── Configuration ──────────────────────────────────────────────
const COMPANY_ID = 1; // Velarix Technology Sdn. Bhd.
const EXCEL_PATH = path.join(__dirname, '..', '..', 'docs', 'data', 'Full_Details_Staff.xlsx');

// ── Helpers ────────────────────────────────────────────────────

/**
 * Convert Excel serial date number to JS Date.
 * Excel serial: days since 1900-01-01 (with the 1900 leap year bug).
 */
function excelSerialToDate(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel epoch: 1900-01-01, but Excel incorrectly treats 1900 as a leap year
  const epoch = new Date(1899, 11, 30); // Dec 30, 1899
  const date = new Date(epoch.getTime() + serial * 86400000);
  return date;
}

/**
 * Format date as YYYY-MM-DD string.
 */
function formatDate(date) {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extract date of birth from Malaysian IC number (format: YYMMDD-SS-NNNN).
 */
function dobFromIC(ic) {
  if (!ic || typeof ic !== 'string') return null;
  const cleaned = ic.replace(/[-\s]/g, '');
  if (cleaned.length < 6) return null;

  let yy = parseInt(cleaned.substring(0, 2), 10);
  const mm = parseInt(cleaned.substring(2, 4), 10);
  const dd = parseInt(cleaned.substring(4, 6), 10);

  // Assume: 00-30 → 2000s, 31-99 → 1900s
  const year = yy <= 30 ? 2000 + yy : 1900 + yy;

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * Infer gender from Malay name convention (bin/ibn = Male, binti/bt = Female).
 */
function inferGender(name) {
  if (!name) return 'Male';
  const lower = name.toLowerCase();
  if (lower.includes('binti') || lower.includes(' bt ')) return 'Female';
  return 'Male';
}

/**
 * Clean and parse salary value.
 */
function parseSalary(val) {
  if (!val || val === '-' || val === '') return 0;
  const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

/**
 * Determine employment type from contract dates.
 */
function getEmploymentType(startDate, endDateRaw) {
  if (!startDate || startDate === '-') return 'Permanent';
  if (endDateRaw === 'Now' || !endDateRaw || endDateRaw === '-') return 'Permanent';
  return 'Contract';
}

/**
 * Parse join date - uses contract start date or defaults to null.
 */
function parseJoinDate(val) {
  if (!val || val === '-' || val === '') return null;
  if (typeof val === 'number') {
    return formatDate(excelSerialToDate(val));
  }
  // Try parsing as date string
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : formatDate(d);
}

// ── Main Import ────────────────────────────────────────────────

async function importEmployees() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    // Read Excel
    const wb = XLSX.readFile(EXCEL_PATH);
    const ws = wb.Sheets['Employee Details'];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // Filter out empty rows
    const validRows = rows.filter(r => r['Name'] && r['Name'].toString().trim() !== '');

    console.log(`Found ${validRows.length} employees in Excel\n`);

    let created = 0;
    let skipped = 0;

    for (const row of validRows) {
      const employeeId = (row['Employee No.'] || '').toString().trim();
      const fullName = (row['Name'] || '').toString().trim();
      const icNo = (row['IC No.'] || '').toString().trim();
      const position = (row['Position'] || '').toString().trim();
      const email = (row['Personal Email '] || '').toString().trim();
      const phone = (row['Phone No'] || '').toString().trim();
      const bankName = (row['Bank Name'] || '').toString().trim();
      const bankAccNo = (row['Bank Acc No'] || '').toString().trim();
      const latestSalary = parseSalary(row[' Latest Salary (RM) ']);
      const confirmSalary = parseSalary(row[' Confirmation Salary (RM) ']);
      const contractStart = row[' Contract Start Date '];
      const contractEnd = row[' Contract End Date '];

      // Use latest salary, fall back to confirmation salary
      const salary = latestSalary || confirmSalary || 0;

      // Skip if no employee ID
      if (!employeeId) {
        console.log(`  ! Skipping row with no employee ID: ${fullName}`);
        continue;
      }

      // Check if already exists
      const existing = await Employee.findOne({
        where: { employee_id: employeeId, company_id: COMPANY_ID }
      });

      if (existing) {
        console.log(`  ~ Skipped (exists): ${employeeId} - ${fullName}`);
        skipped++;
        continue;
      }

      // Build employee data
      const joinDate = parseJoinDate(contractStart);
      const employeeData = {
        company_id: COMPANY_ID,
        employee_id: employeeId,
        full_name: fullName,
        ic_no: icNo || null,
        date_of_birth: dobFromIC(icNo),
        gender: inferGender(fullName),
        nationality: 'Malaysian',
        email: email || null,
        mobile: phone || null,
        position: position || null,
        department: 'Technology', // Default - update as needed
        basic_salary: salary,
        join_date: joinDate || '2025-01-01', // Fallback if no date
        employment_type: getEmploymentType(contractStart, contractEnd),
        employment_status: 'Active',
        bank_name: bankName || null,
        bank_account_no: bankAccNo ? String(bankAccNo) : null,
      };

      await Employee.create(employeeData);
      console.log(`  + Created: ${employeeId} - ${fullName} (${position}, RM${salary})`);
      created++;
    }

    console.log(`\n------------------------------------`);
    console.log(`Import complete!`);
    console.log(`  Created: ${created}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Total:   ${created + skipped}`);
    console.log(`------------------------------------\n`);

    process.exit(0);
  } catch (error) {
    console.error('Import failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

importEmployees();
