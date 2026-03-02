/**
 * Seed Averroes (company_id=2) employee records and payroll data.
 * - Copies employee details from Velarix (company_id=1) to Averroes
 * - Creates inactive UserCompany records for staff with user accounts
 * - Seeds payroll + YTD statutory data from monthly Excel files
 *
 * Usage: node database/seeds/seed-averroes-company-data.js
 */
require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const { sequelize } = require('../../src/config/database');

// ── Configuration ──────────────────────────────────────────────
const VELARIX_COMPANY_ID = 1;
const AVERROES_COMPANY_ID = 2;
const YEAR = 2025;
const DATA_DIR = path.join(__dirname, '..', '..', 'docs', 'data', 'Averroes_Payroll_Statutory_2025');

// Staff mapping: Velarix DB id → Averroes employee_id + payroll months
// Asyifa not in Velarix, handled separately
const STAFF_MAP = [
  { velarixDbId: 3,  averroesEid: 'AVS003',  name: 'Mohammad Amier Akram bin Mohd Zaki', months: [1] },
  { velarixDbId: null, averroesEid: 'AVS004', name: 'Asyifa binti Abd Malik', months: [1], notInVelarix: true, basicSalary: 5700, gender: 'Female' },
  { velarixDbId: 5,  averroesEid: 'AVS006',  name: 'Ainaa Rasyidah binti Hashim', months: [1] },
  { velarixDbId: 4,  averroesEid: 'AVS007',  name: 'Muhamad Akram Hakim bin Jamaludin', months: [1] },
  { velarixDbId: null, averroesEid: 'AVS008', name: 'Muhammad Haziq Hilman bin Hamzan', months: [1, 2, 3, 4, 5, 6], alreadyExists: true },
  { velarixDbId: 7,  averroesEid: 'AVS0044', name: 'Abdul Muhaimin bin Zulkifli', months: [1] },
  { velarixDbId: 10, averroesEid: 'AVS016',  name: 'Fatimah binti Majenin', months: [1, 2, 3, 4, 5, 6] },
  { velarixDbId: 6,  averroesEid: 'AVS030',  name: 'Ammar bin Amran', months: [1] },
  { velarixDbId: 8,  averroesEid: 'AVS033',  name: 'Muhammad bin Taib', months: [1, 2] },
  { velarixDbId: 9,  averroesEid: 'AVS043',  name: 'Ungku Mohamed Ismail Adrian bin Ungku Abdul Rahman', months: [1, 2] },
];

// Monthly payroll Excel files
const MONTHLY_FILES = {
  1: '1. Averroes Salary Jan 2025.xlsx',
  2: '2. Averroes Salary Feb 2025.xlsx',
  3: '3. Averroes Salary Mac 2025.xlsx',
  4: '4. Averroes Salary April 2025.xlsx',
  5: '5. Averroes Salary May 2025.xlsx',
  6: '6. Averroes Salary June 2025.xlsx',
};

// ── Helpers ────────────────────────────────────────────────────

function parseNum(val) {
  if (val === null || val === undefined || val === '' || val === '-') return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function getLastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Parse a monthly payroll Excel file.
 * Returns array of { employeeNo, basicSalary, allowance, grossSalary, ... }
 * Uses header:1 (array index) to avoid column name variations.
 *
 * Column layout (from row 0 header):
 * [0]=No, [1]=Employee No, [2]=Name, [3]=Basic Salary, [4]=Allowance,
 * [5]=Gross Salary, [6]=EPF Employer, [7]=EPF Employee,
 * [8]=SOCSO Employer, [9]=SOCSO Employee, [10]=EIS Employer, [11]=EIS Employee,
 * [12]=Income Tax, [13]=Net Salary
 */
function parseMonthlyExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const records = [];
  // Data starts at row 2 (after 2 header rows)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1]) continue; // skip empty rows

    const employeeNo = String(row[1]).trim();
    const grossSalary = parseNum(row[5]);

    // Skip total rows or zero-salary rows
    if (!employeeNo || grossSalary === 0) continue;

    records.push({
      employeeNo,
      name: String(row[2] || '').trim(),
      basicSalary: parseNum(row[3]),
      allowance: parseNum(row[4]),
      grossSalary,
      epfEmployer: parseNum(row[6]),
      epfEmployee: parseNum(row[7]),
      socsoEmployer: parseNum(row[8]),
      socsoEmployee: parseNum(row[9]),
      eisEmployer: parseNum(row[10]),
      eisEmployee: parseNum(row[11]),
      incomeTax: parseNum(row[12]),
      netSalary: parseNum(row[13]),
    });
  }

  return records;
}

// ── Main Seed ──────────────────────────────────────────────────

async function seedAverroesData() {
  const transaction = await sequelize.transaction();

  try {
    await sequelize.authenticate();
    console.log('Connected to database\n');

    // ── Step 1: Create Averroes Employee Records ──────────────
    console.log('=== Step 1: Creating Averroes Employee Records ===\n');

    // Map averroesEid → new Averroes employee DB id
    const averroesEmployeeMap = {};
    let employeesCreated = 0;
    let employeesSkipped = 0;

    for (const staff of STAFF_MAP) {
      // Check if already exists in Averroes
      const [existing] = await sequelize.query(
        `SELECT id FROM employees WHERE employee_id = :eid AND company_id = :cid`,
        { replacements: { eid: staff.averroesEid, cid: AVERROES_COMPANY_ID }, transaction, type: sequelize.QueryTypes.SELECT }
      );

      if (existing) {
        averroesEmployeeMap[staff.averroesEid] = existing.id;
        console.log(`  ~ Skipped (exists): ${staff.averroesEid} - ${staff.name} (id=${existing.id})`);
        employeesSkipped++;
        continue;
      }

      let employeeData;

      if (staff.notInVelarix) {
        // Asyifa - create from scratch
        employeeData = {
          company_id: AVERROES_COMPANY_ID,
          employee_id: staff.averroesEid,
          full_name: staff.name,
          gender: staff.gender || 'Female',
          basic_salary: staff.basicSalary,
          join_date: '2025-01-01',
          employment_status: 'Resigned',
          employment_type: 'Permanent',
          nationality: 'Malaysian',
          department: 'Technology',
        };
      } else {
        // Copy from Velarix employee
        const [velarixEmp] = await sequelize.query(
          `SELECT * FROM employees WHERE id = :id AND company_id = :cid`,
          { replacements: { id: staff.velarixDbId, cid: VELARIX_COMPANY_ID }, transaction, type: sequelize.QueryTypes.SELECT }
        );

        if (!velarixEmp) {
          console.log(`  ! Velarix employee not found: id=${staff.velarixDbId} - ${staff.name}`);
          continue;
        }

        employeeData = {
          company_id: AVERROES_COMPANY_ID,
          employee_id: staff.averroesEid,
          user_id: velarixEmp.user_id || null,
          full_name: velarixEmp.full_name,
          ic_no: velarixEmp.ic_no || null,
          passport_no: velarixEmp.passport_no || null,
          date_of_birth: velarixEmp.date_of_birth || null,
          gender: velarixEmp.gender,
          marital_status: velarixEmp.marital_status || null,
          nationality: velarixEmp.nationality || 'Malaysian',
          race: velarixEmp.race || null,
          religion: velarixEmp.religion || null,
          mobile: velarixEmp.mobile || null,
          email: velarixEmp.email || null,
          emergency_contact_name: velarixEmp.emergency_contact_name || null,
          emergency_contact_phone: velarixEmp.emergency_contact_phone || null,
          current_address: velarixEmp.current_address || null,
          permanent_address: velarixEmp.permanent_address || null,
          position: velarixEmp.position || null,
          department: velarixEmp.department || null,
          basic_salary: velarixEmp.basic_salary,
          join_date: '2025-01-01',
          employment_type: velarixEmp.employment_type || 'Permanent',
          employment_status: 'Resigned',
          work_location: velarixEmp.work_location || null,
          bank_name: velarixEmp.bank_name || null,
          bank_account_no: velarixEmp.bank_account_no || null,
          bank_account_holder: velarixEmp.bank_account_holder || null,
          epf_no: velarixEmp.epf_no || null,
          socso_no: velarixEmp.socso_no || null,
          tax_no: velarixEmp.tax_no || null,
          tax_category: velarixEmp.tax_category || 'KA',
          number_of_children: velarixEmp.number_of_children || 0,
          children_in_higher_education: velarixEmp.children_in_higher_education || 0,
          disabled_self: velarixEmp.disabled_self || false,
          disabled_spouse: velarixEmp.disabled_spouse || false,
          disabled_children: velarixEmp.disabled_children || 0,
        };
      }

      // Build INSERT query dynamically from employeeData
      const cols = Object.keys(employeeData);
      const placeholders = cols.map(c => `:${c}`);
      const [result] = await sequelize.query(
        `INSERT INTO employees (${cols.join(', ')}, created_at, updated_at)
         VALUES (${placeholders.join(', ')}, NOW(), NOW())
         RETURNING id`,
        { replacements: employeeData, transaction }
      );

      const newId = result[0].id;
      averroesEmployeeMap[staff.averroesEid] = newId;
      console.log(`  + Created: ${staff.averroesEid} - ${staff.name} (id=${newId})`);
      employeesCreated++;

      // ── Step 2: Create UserCompany record (inactive) ────────
      if (employeeData.user_id) {
        const [existingUC] = await sequelize.query(
          `SELECT id FROM user_companies WHERE user_id = :uid AND company_id = :cid`,
          { replacements: { uid: employeeData.user_id, cid: AVERROES_COMPANY_ID }, transaction, type: sequelize.QueryTypes.SELECT }
        );

        if (!existingUC) {
          await sequelize.query(
            `INSERT INTO user_companies (user_id, company_id, role, employee_id, status, joined_at, created_at, updated_at)
             VALUES (:user_id, :company_id, 'staff', :employee_id, 'inactive', NOW(), NOW(), NOW())`,
            { replacements: { user_id: employeeData.user_id, company_id: AVERROES_COMPANY_ID, employee_id: newId }, transaction }
          );
          console.log(`    + UserCompany (inactive): user_id=${employeeData.user_id} → company_id=${AVERROES_COMPANY_ID}`);
        }
      }
    }

    console.log(`\nEmployees: ${employeesCreated} created, ${employeesSkipped} skipped\n`);

    // ── Step 3: Parse Excel and seed Payroll + YTD ────────────
    console.log('=== Step 3: Seeding Payroll & YTD Statutory ===\n');

    // Track YTD accumulators per employee
    const ytdAcc = {};
    let totalPayroll = 0;
    let totalYTD = 0;

    // Process months in order (1-6)
    const months = Object.keys(MONTHLY_FILES).map(Number).sort((a, b) => a - b);

    for (const month of months) {
      const fileName = MONTHLY_FILES[month];
      const filePath = path.join(DATA_DIR, fileName);
      console.log(`Processing: ${fileName}`);

      let monthlyData;
      try {
        monthlyData = parseMonthlyExcel(filePath);
      } catch (err) {
        console.error(`  ! Failed to read: ${err.message}`);
        continue;
      }

      // For each staff member, check if they should have payroll this month
      for (const staff of STAFF_MAP) {
        if (!staff.months.includes(month)) continue;

        const averroesDbId = averroesEmployeeMap[staff.averroesEid];
        if (!averroesDbId) {
          console.log(`  ! No Averroes employee ID for ${staff.averroesEid}`);
          continue;
        }

        // Find this employee in the monthly Excel data
        const payData = monthlyData.find(r => r.employeeNo === staff.averroesEid);
        if (!payData) {
          console.log(`  ! No payroll data for ${staff.averroesEid} in month ${month}`);
          continue;
        }

        // Check if payroll already exists
        const [existingPayroll] = await sequelize.query(
          `SELECT id FROM payroll WHERE employee_id = :eid AND year = :year AND month = :month`,
          { replacements: { eid: averroesDbId, year: YEAR, month }, transaction, type: sequelize.QueryTypes.SELECT }
        );

        if (existingPayroll) {
          console.log(`  ~ Payroll exists: ${staff.averroesEid} month ${month}`);
          continue;
        }

        const lastDay = getLastDayOfMonth(YEAR, month);
        const monthStr = String(month).padStart(2, '0');
        const payPeriodStart = `${YEAR}-${monthStr}-01`;
        const payPeriodEnd = `${YEAR}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

        const totalDeductions = parseNum(
          payData.epfEmployee + payData.socsoEmployee + payData.eisEmployee + payData.incomeTax
        );

        // Insert Payroll
        await sequelize.query(
          `INSERT INTO payroll (
            employee_id, pay_period_start, pay_period_end, payment_date,
            month, year, basic_salary, allowances, gross_salary,
            epf_employee, epf_employer, socso_employee, socso_employer,
            eis_employee, eis_employer, pcb_deduction,
            total_deductions, net_salary,
            status, payment_method, created_at, updated_at
          ) VALUES (
            :employee_id, :pay_period_start, :pay_period_end, :payment_date,
            :month, :year, :basic_salary, :allowances, :gross_salary,
            :epf_employee, :epf_employer, :socso_employee, :socso_employer,
            :eis_employee, :eis_employer, :pcb_deduction,
            :total_deductions, :net_salary,
            'Paid', 'Bank Transfer', NOW(), NOW()
          )`,
          {
            replacements: {
              employee_id: averroesDbId,
              pay_period_start: payPeriodStart,
              pay_period_end: payPeriodEnd,
              payment_date: payPeriodEnd,
              month,
              year: YEAR,
              basic_salary: payData.basicSalary,
              allowances: payData.allowance,
              gross_salary: payData.grossSalary,
              epf_employee: payData.epfEmployee,
              epf_employer: payData.epfEmployer,
              socso_employee: payData.socsoEmployee,
              socso_employer: payData.socsoEmployer,
              eis_employee: payData.eisEmployee,
              eis_employer: payData.eisEmployer,
              pcb_deduction: payData.incomeTax,
              total_deductions: totalDeductions,
              net_salary: payData.netSalary,
            },
            transaction
          }
        );
        totalPayroll++;

        // Update YTD accumulator
        if (!ytdAcc[staff.averroesEid]) {
          ytdAcc[staff.averroesEid] = {
            ytdGross: 0, ytdNet: 0,
            ytdEpfEmployee: 0, ytdEpfEmployer: 0,
            ytdSocsoEmployee: 0, ytdSocsoEmployer: 0,
            ytdEisEmployee: 0, ytdEisEmployer: 0,
            ytdPcb: 0,
          };
        }
        const acc = ytdAcc[staff.averroesEid];
        acc.ytdGross += payData.grossSalary;
        acc.ytdNet += payData.netSalary;
        acc.ytdEpfEmployee += payData.epfEmployee;
        acc.ytdEpfEmployer += payData.epfEmployer;
        acc.ytdSocsoEmployee += payData.socsoEmployee;
        acc.ytdSocsoEmployer += payData.socsoEmployer;
        acc.ytdEisEmployee += payData.eisEmployee;
        acc.ytdEisEmployer += payData.eisEmployer;
        acc.ytdPcb += payData.incomeTax;

        // Check if YTD already exists
        const [existingYTD] = await sequelize.query(
          `SELECT id FROM ytd_statutory WHERE employee_id = :eid AND year = :year AND month = :month`,
          { replacements: { eid: averroesDbId, year: YEAR, month }, transaction, type: sequelize.QueryTypes.SELECT }
        );

        if (existingYTD) {
          console.log(`  ~ YTD exists: ${staff.averroesEid} month ${month}`);
          continue;
        }

        // Insert YTD Statutory
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
              employee_id: averroesDbId,
              year: YEAR,
              month,
              gross_salary: payData.grossSalary,
              net_salary: payData.netSalary,
              employee_epf: payData.epfEmployee,
              employer_epf: payData.epfEmployer,
              total_epf: parseNum(payData.epfEmployee + payData.epfEmployer),
              employee_socso: payData.socsoEmployee,
              employer_socso: payData.socsoEmployer,
              total_socso: parseNum(payData.socsoEmployee + payData.socsoEmployer),
              employee_eis: payData.eisEmployee,
              employer_eis: payData.eisEmployer,
              total_eis: parseNum(payData.eisEmployee + payData.eisEmployer),
              pcb_deduction: payData.incomeTax,
              ytd_gross: parseNum(acc.ytdGross),
              ytd_net: parseNum(acc.ytdNet),
              ytd_employee_epf: parseNum(acc.ytdEpfEmployee),
              ytd_employer_epf: parseNum(acc.ytdEpfEmployer),
              ytd_employee_socso: parseNum(acc.ytdSocsoEmployee),
              ytd_employer_socso: parseNum(acc.ytdSocsoEmployer),
              ytd_employee_eis: parseNum(acc.ytdEisEmployee),
              ytd_employer_eis: parseNum(acc.ytdEisEmployer),
              ytd_pcb: parseNum(acc.ytdPcb),
            },
            transaction
          }
        );
        totalYTD++;
      }

      console.log(`  Done (month ${month})`);
    }

    await transaction.commit();

    console.log('\n====================================');
    console.log('Seed complete!');
    console.log(`  Employees created: ${employeesCreated}`);
    console.log(`  Employees skipped: ${employeesSkipped}`);
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

seedAverroesData();
