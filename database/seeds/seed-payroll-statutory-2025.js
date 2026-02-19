/**
 * Seed payroll and YTD statutory data for 2025 from Excel files.
 * Reads individual employee Excel files from docs/data/Payroll_Statutory_2025/
 * and populates the payroll and ytd_statutory tables.
 *
 * Usage: node database/seeds/seed-payroll-statutory-2025.js
 */
require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const { sequelize } = require('../../src/config/database');

// ── Configuration ──────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '..', '..', 'docs', 'data', 'Payroll_Statutory_2025');

// Map Excel file names to database employee IDs
const EMPLOYEE_MAP = {
  'Mohammad Amier Akram bin Mohd Zaki': 3,
  'Muhamad Akram Hakim bin Jamaludin': 4,
  'Aina Rasyidah binti Hashim': 5,
  'Ammar bin Amran': 6,
  'Abdul Muhaimin bin Zulkifli': 7,
  'Muhammad Bin Taib': 8,
  'Ungku Mohamed Ismail Adrian bin Ungku Abdul Rahman': 9,
  'Fatimah binti Majenin': 10,
  'Shahrulnizam Bin Ibrahim': 11,
};

const MONTH_MAP = {
  'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
  'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
};

// ── Helpers ────────────────────────────────────────────────────

function getLastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseNum(val) {
  if (val === null || val === undefined || val === '' || val === '-') return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function parseExcelData(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const records = [];
  // Data rows start at index 2 (after 2 header rows)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;

    const year = row[0];
    const monthStr = row[1];

    // Skip total row and empty rows
    if (year === 'Total' || typeof year !== 'number') continue;
    if (!monthStr || typeof monthStr !== 'string') continue;

    const month = MONTH_MAP[monthStr];
    if (!month) continue;

    const salary = parseNum(row[2]);
    const netSalary = parseNum(row[3]);

    // Skip months with no salary data (empty months like Aina's Oct-Dec)
    if (salary === 0 && netSalary === 0) continue;

    records.push({
      year,
      month,
      salary,
      netSalary,
      // Employee deductions
      epfEmployee: parseNum(row[4]),
      socsoEmployee: parseNum(row[5]),
      eisEmployee: parseNum(row[6]),
      pcbDeduction: parseNum(row[7]),
      // YTD Employee
      ytdEpfEmployee: parseNum(row[8]),
      ytdSocsoEmployee: parseNum(row[9]),
      ytdEisEmployee: parseNum(row[10]),
      ytdPcb: parseNum(row[11]),
      // Employer deductions
      epfEmployer: parseNum(row[12]),
      socsoEmployer: parseNum(row[13]),
      eisEmployer: parseNum(row[14]),
      // YTD Employer
      ytdEpfEmployer: parseNum(row[15]),
      ytdSocsoEmployer: parseNum(row[16]),
      ytdEisEmployer: parseNum(row[17]),
    });
  }

  return records;
}

// ── Main Seed ──────────────────────────────────────────────────

async function seedPayrollStatutory() {
  const transaction = await sequelize.transaction();

  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    // Collect all employee IDs we'll be seeding
    const employeeIds = Object.values(EMPLOYEE_MAP);

    // Clear existing 2025 data for these employees
    console.log('Clearing existing 2025 payroll data...');
    await sequelize.query(
      `DELETE FROM payroll WHERE year = 2025 AND employee_id IN (${employeeIds.join(',')})`,
      { transaction }
    );

    console.log('Clearing existing 2025 YTD statutory data...');
    await sequelize.query(
      `DELETE FROM ytd_statutory WHERE year = 2025 AND employee_id IN (${employeeIds.join(',')})`,
      { transaction }
    );

    let totalPayroll = 0;
    let totalYTD = 0;

    for (const [fileName, employeeId] of Object.entries(EMPLOYEE_MAP)) {
      const filePath = path.join(DATA_DIR, `${fileName}.xlsx`);

      console.log(`\nProcessing: ${fileName} (employee_id: ${employeeId})`);

      let records;
      try {
        records = parseExcelData(filePath);
      } catch (err) {
        console.error(`  ! Failed to read file: ${err.message}`);
        continue;
      }

      if (records.length === 0) {
        console.log('  ! No valid records found');
        continue;
      }

      // Track running YTD gross and net totals
      let ytdGross = 0;
      let ytdNet = 0;

      for (const rec of records) {
        const lastDay = getLastDayOfMonth(rec.year, rec.month);
        const monthStr = String(rec.month).padStart(2, '0');
        const payPeriodStart = `${rec.year}-${monthStr}-01`;
        const payPeriodEnd = `${rec.year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
        const paymentDate = payPeriodEnd;

        const totalDeductions = parseNum(
          rec.epfEmployee + rec.socsoEmployee + rec.eisEmployee + rec.pcbDeduction
        );

        // Insert Payroll record
        await sequelize.query(
          `INSERT INTO payroll (
            employee_id, pay_period_start, pay_period_end, payment_date,
            month, year, basic_salary, gross_salary,
            epf_employee, epf_employer, socso_employee, socso_employer,
            eis_employee, eis_employer, pcb_deduction,
            total_deductions, net_salary,
            status, payment_method, created_at, updated_at
          ) VALUES (
            :employee_id, :pay_period_start, :pay_period_end, :payment_date,
            :month, :year, :basic_salary, :gross_salary,
            :epf_employee, :epf_employer, :socso_employee, :socso_employer,
            :eis_employee, :eis_employer, :pcb_deduction,
            :total_deductions, :net_salary,
            'Paid', 'Bank Transfer', NOW(), NOW()
          )`,
          {
            replacements: {
              employee_id: employeeId,
              pay_period_start: payPeriodStart,
              pay_period_end: payPeriodEnd,
              payment_date: paymentDate,
              month: rec.month,
              year: rec.year,
              basic_salary: rec.salary,
              gross_salary: rec.salary,
              epf_employee: rec.epfEmployee,
              epf_employer: rec.epfEmployer,
              socso_employee: rec.socsoEmployee,
              socso_employer: rec.socsoEmployer,
              eis_employee: rec.eisEmployee,
              eis_employer: rec.eisEmployer,
              pcb_deduction: rec.pcbDeduction,
              total_deductions: totalDeductions,
              net_salary: rec.netSalary,
            },
            transaction
          }
        );
        totalPayroll++;

        // Calculate running YTD gross/net
        ytdGross += rec.salary;
        ytdNet += rec.netSalary;

        // Insert YTD Statutory record
        await sequelize.query(
          `INSERT INTO ytd_statutory (
            employee_id, year, month,
            gross_salary, net_salary,
            employee_epf, employer_epf, total_epf,
            employee_socso, employer_socso, total_socso,
            employee_eis, employer_eis, total_eis,
            pcb_deduction,
            ytd_gross, ytd_net,
            ytd_employee_epf, ytd_employer_epf,
            ytd_employee_socso, ytd_employer_socso,
            ytd_employee_eis, ytd_employer_eis,
            ytd_pcb,
            created_at, updated_at
          ) VALUES (
            :employee_id, :year, :month,
            :gross_salary, :net_salary,
            :employee_epf, :employer_epf, :total_epf,
            :employee_socso, :employer_socso, :total_socso,
            :employee_eis, :employer_eis, :total_eis,
            :pcb_deduction,
            :ytd_gross, :ytd_net,
            :ytd_employee_epf, :ytd_employer_epf,
            :ytd_employee_socso, :ytd_employer_socso,
            :ytd_employee_eis, :ytd_employer_eis,
            :ytd_pcb,
            NOW(), NOW()
          )`,
          {
            replacements: {
              employee_id: employeeId,
              year: rec.year,
              month: rec.month,
              gross_salary: rec.salary,
              net_salary: rec.netSalary,
              employee_epf: rec.epfEmployee,
              employer_epf: rec.epfEmployer,
              total_epf: parseNum(rec.epfEmployee + rec.epfEmployer),
              employee_socso: rec.socsoEmployee,
              employer_socso: rec.socsoEmployer,
              total_socso: parseNum(rec.socsoEmployee + rec.socsoEmployer),
              employee_eis: rec.eisEmployee,
              employer_eis: rec.eisEmployer,
              total_eis: parseNum(rec.eisEmployee + rec.eisEmployer),
              pcb_deduction: rec.pcbDeduction,
              ytd_gross: parseNum(ytdGross),
              ytd_net: parseNum(ytdNet),
              ytd_employee_epf: rec.ytdEpfEmployee,
              ytd_employer_epf: rec.ytdEpfEmployer,
              ytd_employee_socso: rec.ytdSocsoEmployee,
              ytd_employer_socso: rec.ytdSocsoEmployer,
              ytd_employee_eis: rec.ytdEisEmployee,
              ytd_employer_eis: rec.ytdEisEmployer,
              ytd_pcb: rec.ytdPcb,
            },
            transaction
          }
        );
        totalYTD++;
      }

      console.log(`  + ${records.length} months of data inserted`);
    }

    await transaction.commit();

    console.log('\n====================================');
    console.log('Seed complete!');
    console.log(`  Payroll records: ${totalPayroll}`);
    console.log(`  YTD Statutory records: ${totalYTD}`);
    console.log('====================================\n');

    process.exit(0);
  } catch (error) {
    await transaction.rollback();
    console.error('\nSeed failed (rolled back):', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

seedPayrollStatutory();
