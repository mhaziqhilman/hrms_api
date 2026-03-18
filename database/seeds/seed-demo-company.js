/**
 * Seed Demo Company - Creates a complete dummy company with test data
 * for staff testing. All data is scoped to the demo company and does NOT
 * interfere with existing Velarix/Averroes data.
 *
 * Usage: node database/seeds/seed-demo-company.js
 * Reset: node database/seeds/seed-demo-company.js --reset
 *
 * Owner: haziqhilman09@gmail.com (will be created if not exists)
 * Test users: demo staff accounts with password "Demo@1234"
 */
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const {
  sequelize, User, Employee, Company, UserCompany,
  LeaveType, LeaveEntitlement, Leave, ClaimType, Claim,
  Attendance, WFHApplication, Payroll, YTDStatutory,
  Memo, MemoReadReceipt, Policy, PolicyAcknowledgment,
  AnnouncementCategory, PublicHoliday, StatutoryConfig,
  Notification, File: FileModel
} = require('../../src/models');

// ─── CONFIG ────────────────────────────────────────────────────────────
const OWNER_EMAIL = 'haziqhilman09@gmail.com';
const DEMO_COMPANY_NAME = 'Demo Corp Sdn Bhd';
const DEFAULT_PASSWORD = 'Demo@1234';

// ─── HELPERS ───────────────────────────────────────────────────────────
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── MAIN SEED ─────────────────────────────────────────────────────────
async function seedDemoCompany() {
  const t = await sequelize.transaction();

  try {
    await sequelize.authenticate();
    console.log('✓ Connected to database\n');

    // ═══════════════════════════════════════════════════════════════════
    // 1. FIND OR CREATE OWNER USER
    // ═══════════════════════════════════════════════════════════════════
    let [owner, ownerCreated] = await User.findOrCreate({
      where: { email: OWNER_EMAIL },
      defaults: {
        email: OWNER_EMAIL,
        password: DEFAULT_PASSWORD,
        role: 'admin',
        is_active: true,
        email_verified: true
      },
      transaction: t
    });
    console.log(`${ownerCreated ? '+ Created' : '~ Found'} owner: ${owner.email}`);

    // Check if demo company already exists
    const existingCompany = await Company.findOne({
      where: { name: DEMO_COMPANY_NAME },
      transaction: t
    });
    if (existingCompany) {
      console.log(`\n⚠ Demo company "${DEMO_COMPANY_NAME}" already exists (ID: ${existingCompany.id}).`);
      if (process.argv.includes('--reset')) {
        console.log('  --reset flag detected. Deleting existing demo company data...');
        await destroyDemoCompany(existingCompany.id, t);
        console.log('  ✓ Old demo data deleted. Re-seeding...\n');
      } else {
        console.log('  To re-seed, run: node database/seeds/seed-demo-company.js --reset');
        await t.rollback();
        process.exit(0);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. CREATE DEMO COMPANY
    // ═══════════════════════════════════════════════════════════════════
    const company = await Company.create({
      name: DEMO_COMPANY_NAME,
      registration_no: 'DEMO-202503-001',
      description: 'A demo company for testing all HRMS features. This is NOT real data.',
      industry: 'Technology',
      size: '11-50',
      country: 'Malaysia',
      address: '123 Demo Street, Cyberjaya, Selangor 63000',
      phone: '+60123456789',
      website: 'https://demo-corp.example.com',
      primary_color: '#2563eb',
      secondary_color: '#7c3aed',
      owner_id: owner.id,
      e_file_no: 'E-DEMO-001',
      employer_epf_no: 'DEMO-EPF-001',
      employer_socso_code: 'DEMO-SOCSO-001',
      signatory_name: 'Ahmad Demo',
      signatory_position: 'Managing Director',
      lhdn_branch: 'Cyberjaya',
      employer_phone: '+60123456789'
    }, { transaction: t });
    console.log(`+ Created company: ${company.name} (ID: ${company.id})`);

    // Link owner to company
    await UserCompany.findOrCreate({
      where: { user_id: owner.id, company_id: company.id },
      defaults: {
        user_id: owner.id,
        company_id: company.id,
        role: 'admin',
        joined_at: new Date()
      },
      transaction: t
    });

    // Set as owner's active company if they don't have one
    if (!owner.company_id) {
      await owner.update({ company_id: company.id, role: 'admin' }, { transaction: t });
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. CREATE DEMO USERS & EMPLOYEES (15 total)
    // ═══════════════════════════════════════════════════════════════════
    const staffData = [
      // --- 2 Managers ---
      {
        email: 'demo.manager@example.com', role: 'manager',
        employee: { employee_id: 'DM-001', full_name: 'Ahmad Razak bin Ibrahim', ic_no: '850315-14-5001', gender: 'Male', date_of_birth: '1985-03-15', marital_status: 'Married', nationality: 'Malaysian', race: 'Malay', religion: 'Islam', mobile: '+60121111001', position: 'Engineering Manager', department: 'Engineering', basic_salary: 8500.00, join_date: '2023-01-15', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'Maybank', bank_account_no: '1234567890', bank_account_holder: 'Ahmad Razak bin Ibrahim', epf_no: 'EPF-DM001', socso_no: 'SOCSO-DM001', tax_no: 'TAX-DM001' }
      },
      {
        email: 'demo.manager2@example.com', role: 'manager',
        employee: { employee_id: 'DM-002', full_name: 'Siti Nurhaliza binti Abdullah', ic_no: '880722-10-5002', gender: 'Female', date_of_birth: '1988-07-22', marital_status: 'Married', nationality: 'Malaysian', race: 'Malay', religion: 'Islam', mobile: '+60121111002', position: 'HR & Finance Manager', department: 'Human Resources', basic_salary: 8000.00, join_date: '2023-03-01', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'CIMB', bank_account_no: '2345678901', bank_account_holder: 'Siti Nurhaliza binti Abdullah', epf_no: 'EPF-DM002', socso_no: 'SOCSO-DM002', tax_no: 'TAX-DM002' }
      },
      // --- 12 Staff (original 6 + 7 new) ---
      {
        email: 'demo.staff1@example.com', role: 'staff',
        employee: { employee_id: 'DS-001', full_name: 'Tan Wei Ming', ic_no: '920410-07-5003', gender: 'Male', date_of_birth: '1992-04-10', marital_status: 'Single', nationality: 'Malaysian', race: 'Chinese', religion: 'Buddhism', mobile: '+60121111003', position: 'Software Developer', department: 'Engineering', basic_salary: 5500.00, join_date: '2024-02-01', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'Public Bank', bank_account_no: '3456789012', bank_account_holder: 'Tan Wei Ming', epf_no: 'EPF-DS001', socso_no: 'SOCSO-DS001', tax_no: 'TAX-DS001' }
      },
      {
        email: 'demo.staff2@example.com', role: 'staff',
        employee: { employee_id: 'DS-002', full_name: 'Priya a/p Subramaniam', ic_no: '950118-04-5004', gender: 'Female', date_of_birth: '1995-01-18', marital_status: 'Single', nationality: 'Malaysian', race: 'Indian', religion: 'Hinduism', mobile: '+60121111004', position: 'UI/UX Designer', department: 'Engineering', basic_salary: 5000.00, join_date: '2024-03-15', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'Hong Leong Bank', bank_account_no: '4567890123', bank_account_holder: 'Priya a/p Subramaniam', epf_no: 'EPF-DS002', socso_no: 'SOCSO-DS002', tax_no: 'TAX-DS002' }
      },
      {
        email: 'demo.staff3@example.com', role: 'staff',
        employee: { employee_id: 'DS-003', full_name: 'Muhammad Hafiz bin Yusof', ic_no: '930805-01-5005', gender: 'Male', date_of_birth: '1993-08-05', marital_status: 'Married', nationality: 'Malaysian', race: 'Malay', religion: 'Islam', mobile: '+60121111005', position: 'QA Engineer', department: 'Engineering', basic_salary: 4800.00, join_date: '2024-06-01', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'RHB Bank', bank_account_no: '5678901234', bank_account_holder: 'Muhammad Hafiz bin Yusof', epf_no: 'EPF-DS003', socso_no: 'SOCSO-DS003', tax_no: 'TAX-DS003' }
      },
      {
        email: 'demo.staff4@example.com', role: 'staff',
        employee: { employee_id: 'DS-004', full_name: 'Lee Siew Ling', ic_no: '970620-11-5006', gender: 'Female', date_of_birth: '1997-06-20', marital_status: 'Single', nationality: 'Malaysian', race: 'Chinese', religion: 'Christianity', mobile: '+60121111006', position: 'Finance Executive', department: 'Finance', basic_salary: 4500.00, join_date: '2024-08-01', employment_type: 'Probation', employment_status: 'Active', bank_name: 'AmBank', bank_account_no: '6789012345', bank_account_holder: 'Lee Siew Ling', epf_no: 'EPF-DS004', socso_no: 'SOCSO-DS004', tax_no: 'TAX-DS004' }
      },
      {
        email: 'demo.intern@example.com', role: 'staff',
        employee: { employee_id: 'DI-001', full_name: 'Nurul Aisyah binti Kamal', ic_no: '010312-14-5007', gender: 'Female', date_of_birth: '2001-03-12', marital_status: 'Single', nationality: 'Malaysian', race: 'Malay', religion: 'Islam', mobile: '+60121111007', position: 'Intern Developer', department: 'Engineering', basic_salary: 1500.00, join_date: '2025-01-06', employment_type: 'Intern', employment_status: 'Active', bank_name: 'Bank Islam', bank_account_no: '7890123456', bank_account_holder: 'Nurul Aisyah binti Kamal', epf_no: 'EPF-DI001', socso_no: 'SOCSO-DI001', tax_no: 'TAX-DI001' }
      },
      // --- 7 NEW STAFF ---
      {
        email: 'demo.staff5@example.com', role: 'staff',
        employee: { employee_id: 'DS-005', full_name: 'Aiman Irfan bin Mohd Rizal', ic_no: '940520-14-5009', gender: 'Male', date_of_birth: '1994-05-20', marital_status: 'Single', nationality: 'Malaysian', race: 'Malay', religion: 'Islam', mobile: '+60121111009', position: 'DevOps Engineer', department: 'Engineering', basic_salary: 6200.00, join_date: '2024-01-15', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'Maybank', bank_account_no: '9012345678', bank_account_holder: 'Aiman Irfan bin Mohd Rizal', epf_no: 'EPF-DS005', socso_no: 'SOCSO-DS005', tax_no: 'TAX-DS005' }
      },
      {
        email: 'demo.staff6@example.com', role: 'staff',
        employee: { employee_id: 'DS-006', full_name: 'Wong Kai Xin', ic_no: '960830-07-5010', gender: 'Female', date_of_birth: '1996-08-30', marital_status: 'Single', nationality: 'Malaysian', race: 'Chinese', religion: 'Buddhism', mobile: '+60121111010', position: 'Business Analyst', department: 'Operations', basic_salary: 5200.00, join_date: '2024-04-01', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'CIMB', bank_account_no: '0123456789', bank_account_holder: 'Wong Kai Xin', epf_no: 'EPF-DS006', socso_no: 'SOCSO-DS006', tax_no: 'TAX-DS006' }
      },
      {
        email: 'demo.staff7@example.com', role: 'staff',
        employee: { employee_id: 'DS-007', full_name: 'Kavitha a/p Rajendran', ic_no: '910215-04-5011', gender: 'Female', date_of_birth: '1991-02-15', marital_status: 'Married', nationality: 'Malaysian', race: 'Indian', religion: 'Hinduism', mobile: '+60121111011', position: 'Senior Accountant', department: 'Finance', basic_salary: 6000.00, join_date: '2023-09-01', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'Public Bank', bank_account_no: '1122334455', bank_account_holder: 'Kavitha a/p Rajendran', epf_no: 'EPF-DS007', socso_no: 'SOCSO-DS007', tax_no: 'TAX-DS007' }
      },
      {
        email: 'demo.staff8@example.com', role: 'staff',
        employee: { employee_id: 'DS-008', full_name: 'Muhammad Zulkifli bin Hassan', ic_no: '890710-01-5012', gender: 'Male', date_of_birth: '1989-07-10', marital_status: 'Married', nationality: 'Malaysian', race: 'Malay', religion: 'Islam', mobile: '+60121111012', position: 'Project Manager', department: 'Operations', basic_salary: 7200.00, join_date: '2023-06-15', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'Hong Leong Bank', bank_account_no: '2233445566', bank_account_holder: 'Muhammad Zulkifli bin Hassan', epf_no: 'EPF-DS008', socso_no: 'SOCSO-DS008', tax_no: 'TAX-DS008' }
      },
      {
        email: 'demo.staff9@example.com', role: 'staff',
        employee: { employee_id: 'DS-009', full_name: 'Lim Jia Wen', ic_no: '980425-10-5013', gender: 'Female', date_of_birth: '1998-04-25', marital_status: 'Single', nationality: 'Malaysian', race: 'Chinese', religion: 'Taoism', mobile: '+60121111013', position: 'Marketing Executive', department: 'Marketing', basic_salary: 4200.00, join_date: '2024-10-01', employment_type: 'Probation', employment_status: 'Active', bank_name: 'RHB Bank', bank_account_no: '3344556677', bank_account_holder: 'Lim Jia Wen', epf_no: 'EPF-DS009', socso_no: 'SOCSO-DS009', tax_no: 'TAX-DS009' }
      },
      {
        email: 'demo.staff10@example.com', role: 'staff',
        employee: { employee_id: 'DS-010', full_name: 'Arjun a/l Krishnan', ic_no: '930112-08-5014', gender: 'Male', date_of_birth: '1993-01-12', marital_status: 'Married', nationality: 'Malaysian', race: 'Indian', religion: 'Hinduism', mobile: '+60121111014', position: 'System Administrator', department: 'Engineering', basic_salary: 5800.00, join_date: '2024-05-15', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'Bank Islam', bank_account_no: '4455667788', bank_account_holder: 'Arjun a/l Krishnan', epf_no: 'EPF-DS010', socso_no: 'SOCSO-DS010', tax_no: 'TAX-DS010' }
      },
      {
        email: 'demo.staff11@example.com', role: 'staff',
        employee: { employee_id: 'DS-011', full_name: 'Farah Nadia binti Osman', ic_no: '950908-14-5015', gender: 'Female', date_of_birth: '1995-09-08', marital_status: 'Single', nationality: 'Malaysian', race: 'Malay', religion: 'Islam', mobile: '+60121111015', position: 'HR Executive', department: 'Human Resources', basic_salary: 4400.00, join_date: '2024-07-01', employment_type: 'Permanent', employment_status: 'Active', bank_name: 'AmBank', bank_account_no: '5566778899', bank_account_holder: 'Farah Nadia binti Osman', epf_no: 'EPF-DS011', socso_no: 'SOCSO-DS011', tax_no: 'TAX-DS011' }
      },
      // --- 1 Resigned employee ---
      {
        email: 'demo.resigned@example.com', role: 'staff',
        employee: { employee_id: 'DS-099', full_name: 'Raj Kumar a/l Muthu', ic_no: '900925-08-5008', gender: 'Male', date_of_birth: '1990-09-25', marital_status: 'Married', nationality: 'Malaysian', race: 'Indian', religion: 'Hinduism', mobile: '+60121111008', position: 'Senior Developer', department: 'Engineering', basic_salary: 7000.00, join_date: '2023-06-01', employment_type: 'Permanent', employment_status: 'Resigned', bank_name: 'OCBC Bank', bank_account_no: '8901234567', bank_account_holder: 'Raj Kumar a/l Muthu', epf_no: 'EPF-DS099', socso_no: 'SOCSO-DS099', tax_no: 'TAX-DS099' }
      }
    ];

    const users = [];
    const employees = [];

    // Create owner employee record
    const ownerEmployee = await Employee.create({
      user_id: owner.id,
      company_id: company.id,
      employee_id: 'DA-001',
      full_name: 'Haziq Hilman (Demo Admin)',
      gender: 'Male',
      date_of_birth: '1995-01-01',
      nationality: 'Malaysian',
      mobile: '+60120000001',
      position: 'Director',
      department: 'Management',
      basic_salary: 12000.00,
      join_date: '2023-01-01',
      employment_type: 'Permanent',
      employment_status: 'Active',
      public_id: uuidv4()
    }, { transaction: t });
    employees.push(ownerEmployee); // index 0
    console.log(`+ Created owner employee: ${ownerEmployee.full_name}`);

    await UserCompany.update(
      { employee_id: ownerEmployee.id },
      { where: { user_id: owner.id, company_id: company.id }, transaction: t }
    );

    for (const sd of staffData) {
      const [user, created] = await User.findOrCreate({
        where: { email: sd.email },
        defaults: {
          email: sd.email,
          password: DEFAULT_PASSWORD,
          role: sd.role,
          is_active: true,
          email_verified: true,
          company_id: company.id
        },
        transaction: t
      });

      if (!created && !user.company_id) {
        await user.update({ company_id: company.id }, { transaction: t });
      }

      const emp = await Employee.create({
        ...sd.employee,
        user_id: user.id,
        company_id: company.id,
        public_id: uuidv4()
      }, { transaction: t });

      await UserCompany.findOrCreate({
        where: { user_id: user.id, company_id: company.id },
        defaults: {
          user_id: user.id,
          company_id: company.id,
          role: sd.role,
          employee_id: emp.id,
          joined_at: new Date()
        },
        transaction: t
      });

      users.push(user);
      employees.push(emp);
      console.log(`  + ${sd.role.padEnd(7)} ${emp.full_name} (${sd.email})`);
    }

    // employees index mapping:
    // 0  = ownerEmployee (DA-001 Haziq)
    // 1  = Ahmad Razak (DM-001 Engineering Manager)
    // 2  = Siti Nurhaliza (DM-002 HR Manager)
    // 3  = Tan Wei Ming (DS-001 Software Dev)
    // 4  = Priya (DS-002 UI/UX)
    // 5  = Hafiz (DS-003 QA)
    // 6  = Lee Siew Ling (DS-004 Finance)
    // 7  = Nurul Aisyah (DI-001 Intern)
    // 8  = Aiman Irfan (DS-005 DevOps)
    // 9  = Wong Kai Xin (DS-006 BA)
    // 10 = Kavitha (DS-007 Senior Accountant)
    // 11 = Zulkifli (DS-008 Project Manager)
    // 12 = Lim Jia Wen (DS-009 Marketing)
    // 13 = Arjun (DS-010 SysAdmin)
    // 14 = Farah Nadia (DS-011 HR Exec)
    // 15 = Raj Kumar (DS-099 Resigned)

    // users index = employees index - 1 (users[0] = manager1, users[1] = manager2, ...)

    // Set reporting managers
    const mgr1 = employees[1]; // Ahmad Razak - Engineering
    const mgr2 = employees[2]; // Siti Nurhaliza - HR/Finance
    await mgr1.update({ reporting_manager_id: ownerEmployee.id }, { transaction: t });
    await mgr2.update({ reporting_manager_id: ownerEmployee.id }, { transaction: t });

    for (let i = 3; i <= 15; i++) {
      const dept = employees[i].department;
      const mgr = (dept === 'Human Resources' || dept === 'Finance') ? mgr2 : mgr1;
      await employees[i].update({ reporting_manager_id: mgr.id }, { transaction: t });
    }
    console.log('  ✓ Reporting structure set\n');

    const managerUser1 = users[0]; // Ahmad Razak user
    const managerUser2 = users[1]; // Siti Nurhaliza user
    const financeUser = users[5]; // Lee Siew Ling user

    // ═══════════════════════════════════════════════════════════════════
    // 4. LEAVE TYPES (company-specific)
    // ═══════════════════════════════════════════════════════════════════
    const leaveTypesData = [
      { company_id: company.id, name: 'Annual Leave', days_per_year: 14, is_paid: true, carry_forward_allowed: true, carry_forward_max_days: 7, prorate_for_new_joiners: true, requires_document: false, description: 'Annual leave entitlement' },
      { company_id: company.id, name: 'Medical Leave', days_per_year: 14, is_paid: true, carry_forward_allowed: false, carry_forward_max_days: 0, prorate_for_new_joiners: false, requires_document: true, description: 'Medical leave - MC required' },
      { company_id: company.id, name: 'Emergency Leave', days_per_year: 5, is_paid: true, carry_forward_allowed: false, carry_forward_max_days: 0, prorate_for_new_joiners: false, requires_document: false, description: 'Emergency personal leave' },
      { company_id: company.id, name: 'Unpaid Leave', days_per_year: 0, is_paid: false, carry_forward_allowed: false, carry_forward_max_days: 0, prorate_for_new_joiners: false, requires_document: false, description: 'Unpaid leave' },
      { company_id: company.id, name: 'Maternity Leave', days_per_year: 98, is_paid: true, carry_forward_allowed: false, carry_forward_max_days: 0, prorate_for_new_joiners: false, requires_document: true, description: '98 days maternity leave per Employment Act' },
      { company_id: company.id, name: 'Paternity Leave', days_per_year: 7, is_paid: true, carry_forward_allowed: false, carry_forward_max_days: 0, prorate_for_new_joiners: false, requires_document: true, description: '7 days paternity leave' },
    ];

    const leaveTypes = [];
    for (const lt of leaveTypesData) {
      const [record] = await LeaveType.findOrCreate({
        where: { company_id: company.id, name: lt.name },
        defaults: lt,
        transaction: t
      });
      leaveTypes.push(record);
    }
    console.log(`+ Created ${leaveTypes.length} leave types`);

    // leaveTypes: [0]=Annual, [1]=Medical, [2]=Emergency, [3]=Unpaid, [4]=Maternity, [5]=Paternity

    // ═══════════════════════════════════════════════════════════════════
    // 5. CLAIM TYPES (company-specific)
    // ═══════════════════════════════════════════════════════════════════
    const claimTypesData = [
      { company_id: company.id, name: 'Medical', description: 'Medical expenses', requires_receipt: true, max_amount: 500.00 },
      { company_id: company.id, name: 'Travel', description: 'Business travel expenses', requires_receipt: true, max_amount: 2000.00 },
      { company_id: company.id, name: 'Meal', description: 'Business meal allowance', requires_receipt: true, max_amount: 100.00 },
      { company_id: company.id, name: 'Parking', description: 'Parking fees', requires_receipt: true, max_amount: 50.00 },
      { company_id: company.id, name: 'Equipment', description: 'Work equipment purchase', requires_receipt: true, max_amount: 3000.00 },
    ];

    const claimTypes = [];
    for (const ct of claimTypesData) {
      const [record] = await ClaimType.findOrCreate({
        where: { company_id: company.id, name: ct.name },
        defaults: ct,
        transaction: t
      });
      claimTypes.push(record);
    }
    console.log(`+ Created ${claimTypes.length} claim types`);
    // claimTypes: [0]=Medical, [1]=Travel, [2]=Meal, [3]=Parking, [4]=Equipment

    // ═══════════════════════════════════════════════════════════════════
    // 6. LEAVE ENTITLEMENTS (2025) - ALL active employees
    // ═══════════════════════════════════════════════════════════════════
    const activeEmployees = employees.filter(e => e.employment_status === 'Active');
    for (const emp of activeEmployees) {
      for (const lt of leaveTypes) {
        if (lt.name === 'Unpaid Leave' || lt.name === 'Maternity Leave' || lt.name === 'Paternity Leave') continue;
        const used = Math.floor(Math.random() * 5);
        const pending = Math.floor(Math.random() * 2);
        await LeaveEntitlement.findOrCreate({
          where: { employee_id: emp.id, leave_type_id: lt.id, year: 2025 },
          defaults: {
            employee_id: emp.id,
            leave_type_id: lt.id,
            year: 2025,
            total_days: lt.days_per_year,
            used_days: used,
            pending_days: pending,
            balance_days: lt.days_per_year - used - pending,
            carry_forward_days: lt.carry_forward_allowed ? Math.floor(Math.random() * 4) : 0
          },
          transaction: t
        });
      }
    }
    console.log(`+ Created leave entitlements for ${activeEmployees.length} employees`);

    // ═══════════════════════════════════════════════════════════════════
    // 7. LEAVES — every active employee has at least 1 leave record
    // ═══════════════════════════════════════════════════════════════════
    const leavesData = [
      // --- Original employees ---
      { employee_id: employees[3].id, leave_type_id: leaveTypes[0].id, start_date: '2025-01-13', end_date: '2025-01-17', total_days: 5, reason: 'Family vacation to Langkawi', status: 'Approved', approver_id: managerUser1.id, approved_at: new Date('2025-01-06') },
      { employee_id: employees[4].id, leave_type_id: leaveTypes[1].id, start_date: '2025-02-10', end_date: '2025-02-11', total_days: 2, reason: 'Down with flu, MC attached', status: 'Approved', approver_id: managerUser1.id, approved_at: new Date('2025-02-10') },
      { employee_id: employees[5].id, leave_type_id: leaveTypes[0].id, start_date: '2025-02-24', end_date: '2025-02-25', total_days: 2, reason: 'Personal matters', status: 'Approved', approver_id: managerUser1.id, approved_at: new Date('2025-02-20') },
      { employee_id: employees[1].id, leave_type_id: leaveTypes[2].id, start_date: '2025-03-03', end_date: '2025-03-03', total_days: 1, reason: 'Pipe burst at home, need emergency repair', status: 'Approved', approver_id: owner.id, approved_at: new Date('2025-03-03') },
      { employee_id: employees[3].id, leave_type_id: leaveTypes[0].id, start_date: '2025-04-14', end_date: '2025-04-18', total_days: 5, reason: 'Hari Raya balik kampung', status: 'Pending' },
      { employee_id: employees[7].id, leave_type_id: leaveTypes[0].id, start_date: '2025-04-21', end_date: '2025-04-22', total_days: 2, reason: 'Personal appointment', status: 'Pending' },
      { employee_id: employees[5].id, leave_type_id: leaveTypes[0].id, start_date: '2025-03-17', end_date: '2025-03-21', total_days: 5, reason: 'Holiday trip', status: 'Rejected', approver_id: managerUser1.id, approved_at: new Date('2025-03-14'), rejection_reason: 'Project deadline that week, please reschedule' },
      { employee_id: employees[6].id, leave_type_id: leaveTypes[0].id, start_date: '2025-03-10', end_date: '2025-03-10', total_days: 0.5, is_half_day: true, half_day_period: 'PM', reason: 'Doctor appointment in the afternoon', status: 'Approved', approver_id: managerUser2.id, approved_at: new Date('2025-03-07') },
      // --- Manager 2 leave ---
      { employee_id: employees[2].id, leave_type_id: leaveTypes[0].id, start_date: '2025-02-03', end_date: '2025-02-04', total_days: 2, reason: 'CNY family gathering', status: 'Approved', approver_id: owner.id, approved_at: new Date('2025-01-28') },
      // --- NEW employees' leaves ---
      // Aiman (DS-005 DevOps) - Annual + Medical
      { employee_id: employees[8].id, leave_type_id: leaveTypes[0].id, start_date: '2025-01-27', end_date: '2025-01-29', total_days: 3, reason: 'Family wedding in Kelantan', status: 'Approved', approver_id: managerUser1.id, approved_at: new Date('2025-01-20') },
      { employee_id: employees[8].id, leave_type_id: leaveTypes[1].id, start_date: '2025-03-06', end_date: '2025-03-07', total_days: 2, reason: 'Food poisoning, MC from Klinik Seri', status: 'Approved', approver_id: managerUser1.id, approved_at: new Date('2025-03-06') },
      // Wong Kai Xin (DS-006 BA) - Emergency + Pending annual
      { employee_id: employees[9].id, leave_type_id: leaveTypes[2].id, start_date: '2025-02-17', end_date: '2025-02-17', total_days: 1, reason: 'Car accident on way to work, minor injuries', status: 'Approved', approver_id: managerUser1.id, approved_at: new Date('2025-02-17') },
      { employee_id: employees[9].id, leave_type_id: leaveTypes[0].id, start_date: '2025-04-07', end_date: '2025-04-09', total_days: 3, reason: 'Short getaway to Cameron Highlands', status: 'Pending' },
      // Kavitha (DS-007 Sr Accountant) - Annual approved + Medical
      { employee_id: employees[10].id, leave_type_id: leaveTypes[0].id, start_date: '2025-01-20', end_date: '2025-01-22', total_days: 3, reason: 'Deepavali family event (makeup from 2024)', status: 'Approved', approver_id: managerUser2.id, approved_at: new Date('2025-01-15') },
      { employee_id: employees[10].id, leave_type_id: leaveTypes[1].id, start_date: '2025-03-11', end_date: '2025-03-11', total_days: 1, reason: 'Dental surgery', status: 'Approved', approver_id: managerUser2.id, approved_at: new Date('2025-03-10') },
      // Zulkifli (DS-008 PM) - Annual + Paternity
      { employee_id: employees[11].id, leave_type_id: leaveTypes[0].id, start_date: '2025-02-10', end_date: '2025-02-14', total_days: 5, reason: 'Annual family trip to Sabah', status: 'Approved', approver_id: managerUser1.id, approved_at: new Date('2025-02-03') },
      { employee_id: employees[11].id, leave_type_id: leaveTypes[5].id, start_date: '2025-05-05', end_date: '2025-05-13', total_days: 7, reason: 'Wife expecting baby in May, paternity leave', status: 'Pending' },
      // Lim Jia Wen (DS-009 Marketing) - Pending + Rejected
      { employee_id: employees[12].id, leave_type_id: leaveTypes[0].id, start_date: '2025-03-24', end_date: '2025-03-26', total_days: 3, reason: 'Music festival in Singapore', status: 'Pending' },
      { employee_id: employees[12].id, leave_type_id: leaveTypes[0].id, start_date: '2025-02-14', end_date: '2025-02-14', total_days: 1, reason: 'Valentine celebration', status: 'Rejected', approver_id: managerUser1.id, approved_at: new Date('2025-02-12'), rejection_reason: 'Product launch event that day, need all hands' },
      // Arjun (DS-010 SysAdmin) - Annual + Emergency
      { employee_id: employees[13].id, leave_type_id: leaveTypes[0].id, start_date: '2025-02-03', end_date: '2025-02-05', total_days: 3, reason: 'Thaipusam family celebration in Batu Caves', status: 'Approved', approver_id: managerUser1.id, approved_at: new Date('2025-01-28') },
      { employee_id: employees[13].id, leave_type_id: leaveTypes[2].id, start_date: '2025-03-04', end_date: '2025-03-04', total_days: 1, reason: 'Burst pipe at apartment, need to be present for repair', status: 'Approved', approver_id: managerUser1.id, approved_at: new Date('2025-03-04') },
      // Farah Nadia (DS-011 HR Exec) - Annual + Half-day
      { employee_id: employees[14].id, leave_type_id: leaveTypes[0].id, start_date: '2025-01-06', end_date: '2025-01-08', total_days: 3, reason: 'New Year extended break', status: 'Approved', approver_id: managerUser2.id, approved_at: new Date('2024-12-30') },
      { employee_id: employees[14].id, leave_type_id: leaveTypes[0].id, start_date: '2025-03-12', end_date: '2025-03-12', total_days: 0.5, is_half_day: true, half_day_period: 'AM', reason: 'JPJ appointment morning', status: 'Approved', approver_id: managerUser2.id, approved_at: new Date('2025-03-10') },
    ];

    for (const lv of leavesData) {
      await Leave.create({ ...lv, public_id: uuidv4() }, { transaction: t });
    }
    console.log(`+ Created ${leavesData.length} leave applications`);

    // ═══════════════════════════════════════════════════════════════════
    // 8. CLAIMS — every active employee has at least 1 claim
    // ═══════════════════════════════════════════════════════════════════
    const claimsData = [
      // --- Original employees ---
      { employee_id: employees[3].id, claim_type_id: claimTypes[0].id, date: '2025-01-20', amount: 150.00, description: 'Clinic visit - fever and cough', status: 'Paid', manager_approved_by: managerUser1.id, manager_approved_at: new Date('2025-01-21'), finance_approved_by: financeUser.id, finance_approved_at: new Date('2025-01-22'), paid_at: new Date('2025-01-31'), payment_reference: 'PAY-2025-001' },
      { employee_id: employees[4].id, claim_type_id: claimTypes[1].id, date: '2025-02-15', amount: 350.00, description: 'Client visit to Penang - fuel + toll', status: 'Finance_Approved', manager_approved_by: managerUser1.id, manager_approved_at: new Date('2025-02-16'), finance_approved_by: financeUser.id, finance_approved_at: new Date('2025-02-17') },
      { employee_id: employees[5].id, claim_type_id: claimTypes[2].id, date: '2025-03-01', amount: 85.50, description: 'Team dinner - overtime work', status: 'Manager_Approved', manager_approved_by: managerUser1.id, manager_approved_at: new Date('2025-03-02') },
      { employee_id: employees[3].id, claim_type_id: claimTypes[3].id, date: '2025-03-05', amount: 25.00, description: 'Parking at KLCC for client meeting', status: 'Pending' },
      { employee_id: employees[6].id, claim_type_id: claimTypes[4].id, date: '2025-03-08', amount: 1200.00, description: 'Mechanical keyboard for development work', status: 'Pending' },
      { employee_id: employees[7].id, claim_type_id: claimTypes[1].id, date: '2025-03-10', amount: 450.00, description: 'Grab rides for client meetings (5 trips)', status: 'Pending' },
      { employee_id: employees[4].id, claim_type_id: claimTypes[2].id, date: '2025-02-28', amount: 200.00, description: 'Team outing dinner', status: 'Rejected', manager_approved_by: managerUser1.id, rejection_reason: 'Not a business meal - team outing should go through department budget' },
      // Manager claims
      { employee_id: employees[1].id, claim_type_id: claimTypes[1].id, date: '2025-02-20', amount: 780.00, description: 'KL-Penang flight for client meeting + hotel', status: 'Paid', manager_approved_by: owner.id, manager_approved_at: new Date('2025-02-21'), finance_approved_by: financeUser.id, finance_approved_at: new Date('2025-02-22'), paid_at: new Date('2025-02-28'), payment_reference: 'PAY-2025-002' },
      { employee_id: employees[2].id, claim_type_id: claimTypes[0].id, date: '2025-01-15', amount: 280.00, description: 'Annual health screening at Pantai Hospital', status: 'Paid', manager_approved_by: owner.id, manager_approved_at: new Date('2025-01-16'), finance_approved_by: financeUser.id, finance_approved_at: new Date('2025-01-17'), paid_at: new Date('2025-01-31'), payment_reference: 'PAY-2025-003' },
      // --- NEW employees' claims ---
      // Aiman (DS-005) - Travel paid + Equipment pending
      { employee_id: employees[8].id, claim_type_id: claimTypes[1].id, date: '2025-02-05', amount: 420.00, description: 'Drive to Johor data center for server migration', status: 'Paid', manager_approved_by: managerUser1.id, manager_approved_at: new Date('2025-02-06'), finance_approved_by: financeUser.id, finance_approved_at: new Date('2025-02-07'), paid_at: new Date('2025-02-15'), payment_reference: 'PAY-2025-004' },
      { employee_id: employees[8].id, claim_type_id: claimTypes[4].id, date: '2025-03-01', amount: 2500.00, description: 'New external monitor for server monitoring setup', status: 'Pending' },
      // Wong Kai Xin (DS-006) - Meal + Travel manager approved
      { employee_id: employees[9].id, claim_type_id: claimTypes[2].id, date: '2025-02-20', amount: 95.00, description: 'Client lunch at Pavilion - requirements gathering session', status: 'Paid', manager_approved_by: managerUser1.id, manager_approved_at: new Date('2025-02-21'), finance_approved_by: financeUser.id, finance_approved_at: new Date('2025-02-22'), paid_at: new Date('2025-02-28'), payment_reference: 'PAY-2025-005' },
      { employee_id: employees[9].id, claim_type_id: claimTypes[1].id, date: '2025-03-10', amount: 165.00, description: 'Grab to client office and back (Bangsar South)', status: 'Manager_Approved', manager_approved_by: managerUser1.id, manager_approved_at: new Date('2025-03-11') },
      // Kavitha (DS-007) - Medical finance approved + Parking
      { employee_id: employees[10].id, claim_type_id: claimTypes[0].id, date: '2025-01-25', amount: 320.00, description: 'Dental crown procedure at Klinik Pergigian', status: 'Finance_Approved', manager_approved_by: managerUser2.id, manager_approved_at: new Date('2025-01-26'), finance_approved_by: financeUser.id, finance_approved_at: new Date('2025-01-27') },
      { employee_id: employees[10].id, claim_type_id: claimTypes[3].id, date: '2025-03-05', amount: 40.00, description: 'Parking at LHDN office for tax filing', status: 'Pending' },
      // Zulkifli (DS-008) - Travel paid + Meal pending
      { employee_id: employees[11].id, claim_type_id: claimTypes[1].id, date: '2025-01-15', amount: 1800.00, description: 'Kuching trip for project kickoff - flight + 2 nights hotel', status: 'Paid', manager_approved_by: managerUser1.id, manager_approved_at: new Date('2025-01-16'), finance_approved_by: financeUser.id, finance_approved_at: new Date('2025-01-17'), paid_at: new Date('2025-01-31'), payment_reference: 'PAY-2025-006' },
      { employee_id: employees[11].id, claim_type_id: claimTypes[2].id, date: '2025-03-07', amount: 78.00, description: 'Dinner with Kuching project stakeholders (video call follow-up dinner)', status: 'Pending' },
      // Lim Jia Wen (DS-009) - Medical rejected + Travel pending
      { employee_id: employees[12].id, claim_type_id: claimTypes[0].id, date: '2025-02-10', amount: 450.00, description: 'Eye examination and new prescription glasses', status: 'Rejected', manager_approved_by: managerUser1.id, rejection_reason: 'Optical claims not covered under medical - please use annual optical benefit instead' },
      { employee_id: employees[12].id, claim_type_id: claimTypes[1].id, date: '2025-03-12', amount: 120.00, description: 'Grab to product launch venue and back', status: 'Pending' },
      // Arjun (DS-010) - Equipment paid + Medical pending
      { employee_id: employees[13].id, claim_type_id: claimTypes[4].id, date: '2025-01-10', amount: 2800.00, description: 'UPS backup power unit for server room', status: 'Paid', manager_approved_by: managerUser1.id, manager_approved_at: new Date('2025-01-11'), finance_approved_by: financeUser.id, finance_approved_at: new Date('2025-01-12'), paid_at: new Date('2025-01-20'), payment_reference: 'PAY-2025-007' },
      { employee_id: employees[13].id, claim_type_id: claimTypes[0].id, date: '2025-03-08', amount: 180.00, description: 'Clinic visit for back pain from server room work', status: 'Pending' },
      // Farah Nadia (DS-011) - Meal paid + Travel manager approved
      { employee_id: employees[14].id, claim_type_id: claimTypes[2].id, date: '2025-02-14', amount: 65.00, description: 'Lunch with new hire candidate (interview)', status: 'Paid', manager_approved_by: managerUser2.id, manager_approved_at: new Date('2025-02-15'), finance_approved_by: financeUser.id, finance_approved_at: new Date('2025-02-16'), paid_at: new Date('2025-02-28'), payment_reference: 'PAY-2025-008' },
      { employee_id: employees[14].id, claim_type_id: claimTypes[1].id, date: '2025-03-06', amount: 95.00, description: 'Grab to university career fair booth setup', status: 'Manager_Approved', manager_approved_by: managerUser2.id, manager_approved_at: new Date('2025-03-07') },
    ];

    for (const cl of claimsData) {
      await Claim.create({ ...cl, public_id: uuidv4() }, { transaction: t });
    }
    console.log(`+ Created ${claimsData.length} claims`);

    // ═══════════════════════════════════════════════════════════════════
    // 9. ATTENDANCE (Feb 1 - Mar 13, 2025) for ALL active employees
    // ═══════════════════════════════════════════════════════════════════
    let attendanceCount = 0;
    const today = new Date('2025-03-13');

    for (const emp of activeEmployees) {
      const startDate = new Date('2025-02-01');
      const d = new Date(startDate);
      while (d <= today) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          const dateStr = formatDate(d);
          const isWfh = Math.random() < 0.15;
          const isLate = Math.random() < 0.1;
          const lateMin = isLate ? Math.floor(Math.random() * 30) + 5 : 0;

          const clockInHour = isLate ? 9 : 8;
          const clockInMin = isLate ? lateMin : Math.floor(Math.random() * 30) + 30;
          const clockOutHour = 17 + Math.floor(Math.random() * 2);
          const clockOutMin = Math.floor(Math.random() * 60);

          const clockIn = new Date(d);
          clockIn.setHours(clockInHour, clockInMin, 0);
          const clockOut = new Date(d);
          clockOut.setHours(clockOutHour, clockOutMin, 0);

          const totalHours = ((clockOut - clockIn) / 3600000).toFixed(2);

          await Attendance.create({
            employee_id: emp.id,
            date: dateStr,
            clock_in_time: clockIn,
            clock_out_time: clockOut,
            total_hours: parseFloat(totalHours),
            type: isWfh ? 'WFH' : 'Office',
            is_late: isLate,
            late_minutes: lateMin,
            is_early_leave: clockOutHour < 18,
            early_leave_minutes: clockOutHour < 18 ? (18 - clockOutHour) * 60 - clockOutMin : 0,
            public_id: uuidv4()
          }, { transaction: t });
          attendanceCount++;
        }
        d.setDate(d.getDate() + 1);
      }
    }
    console.log(`+ Created ${attendanceCount} attendance records`);

    // ═══════════════════════════════════════════════════════════════════
    // 10. WFH APPLICATIONS (mix across employees)
    // ═══════════════════════════════════════════════════════════════════
    const wfhData = [
      { employee_id: employees[3].id, date: '2025-03-14', reason: 'Waiting for plumber at home', status: 'Approved', approved_by: managerUser1.id, approved_at: new Date('2025-03-12') },
      { employee_id: employees[4].id, date: '2025-03-14', reason: 'Car in workshop for service', status: 'Approved', approved_by: managerUser1.id, approved_at: new Date('2025-03-13') },
      { employee_id: employees[5].id, date: '2025-03-17', reason: 'Need to focus on report - no office distractions', status: 'Pending' },
      { employee_id: employees[6].id, date: '2025-03-17', reason: 'Doctor follow-up in the morning, will WFH after', status: 'Pending' },
      { employee_id: employees[3].id, date: '2025-03-03', reason: 'Internet issue at office area', status: 'Rejected', approved_by: managerUser1.id, approved_at: new Date('2025-03-03'), rejection_reason: 'All-hands meeting that day, need to be in office' },
      // New employees
      { employee_id: employees[8].id, date: '2025-03-14', reason: 'Server migration can be done remotely', status: 'Approved', approved_by: managerUser1.id, approved_at: new Date('2025-03-13') },
      { employee_id: employees[9].id, date: '2025-03-18', reason: 'Writing BA documents, need quiet environment', status: 'Pending' },
      { employee_id: employees[11].id, date: '2025-03-14', reason: 'Client video calls all day, better from home', status: 'Approved', approved_by: managerUser1.id, approved_at: new Date('2025-03-13') },
      { employee_id: employees[13].id, date: '2025-03-17', reason: 'Monitoring overnight deployment from home', status: 'Pending' },
      { employee_id: employees[14].id, date: '2025-03-18', reason: 'Reviewing CVs and scheduling interviews', status: 'Pending' },
    ];

    for (const wfh of wfhData) {
      await WFHApplication.create(wfh, { transaction: t });
    }
    console.log(`+ Created ${wfhData.length} WFH applications`);

    // ═══════════════════════════════════════════════════════════════════
    // 11. PAYROLL (Jan + Feb 2025) for ALL active employees
    // ═══════════════════════════════════════════════════════════════════
    let payrollCount = 0;
    for (const month of [1, 2]) {
      for (const emp of activeEmployees) {
        const salary = parseFloat(emp.basic_salary);
        const epfEmp = Math.round(salary * 0.11 * 100) / 100;
        const epfEr = Math.round(salary * 0.13 * 100) / 100;
        const socsoEmp = Math.round(salary * 0.005 * 100) / 100;
        const socsoEr = Math.round(salary * 0.0175 * 100) / 100;
        const eisEmp = Math.round(salary * 0.002 * 100) / 100;
        const eisEr = Math.round(salary * 0.002 * 100) / 100;
        const pcb = Math.round(salary * 0.03 * 100) / 100;
        const totalDed = Math.round((epfEmp + socsoEmp + eisEmp + pcb) * 100) / 100;

        await Payroll.create({
          employee_id: emp.id,
          pay_period_start: `2025-${String(month).padStart(2, '0')}-01`,
          pay_period_end: `2025-${String(month).padStart(2, '0')}-${month === 2 ? 28 : 31}`,
          payment_date: `2025-${String(month).padStart(2, '0')}-${month === 2 ? 28 : 31}`,
          month, year: 2025,
          basic_salary: salary,
          allowances: 0, overtime_pay: 0, bonus: 0, commission: 0,
          gross_salary: salary,
          epf_employee: epfEmp, epf_employer: epfEr,
          socso_employee: socsoEmp, socso_employer: socsoEr,
          eis_employee: eisEmp, eis_employer: eisEr,
          pcb_deduction: pcb,
          unpaid_leave_deduction: 0, other_deductions: 0,
          total_deductions: totalDed,
          net_salary: Math.round((salary - totalDed) * 100) / 100,
          status: 'Paid',
          payment_method: 'Bank Transfer',
          processed_by: owner.id,
          approved_by: owner.id,
          approved_at: new Date(`2025-${String(month).padStart(2, '0')}-25`),
          public_id: uuidv4()
        }, { transaction: t });
        payrollCount++;

        // YTD Statutory
        await YTDStatutory.findOrCreate({
          where: { employee_id: emp.id, year: 2025, month },
          defaults: {
            employee_id: emp.id, year: 2025, month,
            gross_salary: salary, net_salary: Math.round((salary - totalDed) * 100) / 100,
            employee_epf: epfEmp, employer_epf: epfEr, total_epf: Math.round((epfEmp + epfEr) * 100) / 100,
            employee_socso: socsoEmp, employer_socso: socsoEr, total_socso: Math.round((socsoEmp + socsoEr) * 100) / 100,
            employee_eis: eisEmp, employer_eis: eisEr, total_eis: Math.round((eisEmp + eisEr) * 100) / 100,
            pcb_deduction: pcb,
            ytd_gross: Math.round(salary * month * 100) / 100,
            ytd_net: Math.round((salary - totalDed) * month * 100) / 100,
            ytd_employee_epf: Math.round(epfEmp * month * 100) / 100,
            ytd_employer_epf: Math.round(epfEr * month * 100) / 100,
            ytd_employee_socso: Math.round(socsoEmp * month * 100) / 100,
            ytd_employer_socso: Math.round(socsoEr * month * 100) / 100,
            ytd_employee_eis: Math.round(eisEmp * month * 100) / 100,
            ytd_employer_eis: Math.round(eisEr * month * 100) / 100,
            ytd_pcb: Math.round(pcb * month * 100) / 100
          },
          transaction: t
        });
      }
    }
    console.log(`+ Created ${payrollCount} payroll records + YTD statutory`);

    // ═══════════════════════════════════════════════════════════════════
    // 12. ANNOUNCEMENT CATEGORIES
    // ═══════════════════════════════════════════════════════════════════
    const categoriesData = [
      { company_id: company.id, name: 'General', slug: 'general', color: '#6b7280', icon: 'megaphone', sort_order: 1 },
      { company_id: company.id, name: 'HR Updates', slug: 'hr-updates', color: '#8b5cf6', icon: 'users', sort_order: 2 },
      { company_id: company.id, name: 'IT Notices', slug: 'it-notices', color: '#3b82f6', icon: 'monitor', sort_order: 3 },
      { company_id: company.id, name: 'Events', slug: 'events', color: '#f59e0b', icon: 'calendar', sort_order: 4 },
      { company_id: company.id, name: 'Urgent', slug: 'urgent', color: '#ef4444', icon: 'alert-triangle', sort_order: 5 },
    ];

    const categories = [];
    for (const cat of categoriesData) {
      const [record] = await AnnouncementCategory.findOrCreate({
        where: { company_id: company.id, slug: cat.slug },
        defaults: cat,
        transaction: t
      });
      categories.push(record);
    }
    console.log(`+ Created ${categories.length} announcement categories`);

    // ═══════════════════════════════════════════════════════════════════
    // 13. MEMOS / ANNOUNCEMENTS
    // ═══════════════════════════════════════════════════════════════════
    const memosData = [
      {
        title: 'Welcome to Demo Corp!',
        content: '<h2>Welcome to the team!</h2><p>We are excited to have you on board at Demo Corp. This is a demo company created for testing the HRMS system. Feel free to explore all features.</p><p>Key things to test:</p><ul><li>Leave applications and approvals</li><li>Claims submission and multi-level approval</li><li>Attendance clock-in/out</li><li>Payroll viewing</li><li>Document management</li></ul>',
        summary: 'Welcome message for all demo company staff',
        author_id: owner.id, company_id: company.id, category_id: categories[0].id,
        status: 'Published', priority: 'High', target_audience: 'All',
        published_at: new Date('2025-01-02'), is_pinned: true, pinned_at: new Date('2025-01-02'),
        public_id: uuidv4()
      },
      {
        title: 'Updated Leave Policy - Effective March 2025',
        content: '<h2>Leave Policy Update</h2><p>Please note the following changes to our leave policy effective 1 March 2025:</p><ol><li>Annual leave carry forward increased to 7 days max</li><li>Paternity leave now 7 days (previously 3)</li><li>Emergency leave requires notification within 2 hours</li></ol><p>Please acknowledge this memo after reading.</p>',
        summary: 'Important changes to leave policy for 2025',
        author_id: owner.id, company_id: company.id, category_id: categories[1].id,
        status: 'Published', priority: 'Normal', target_audience: 'All',
        published_at: new Date('2025-03-01'), requires_acknowledgment: true,
        public_id: uuidv4()
      },
      {
        title: 'System Maintenance - 15 March 2025',
        content: '<p>Please be informed that the HRMS system will undergo scheduled maintenance on Saturday, 15 March 2025 from 10:00 PM to 2:00 AM.</p><p>During this period, the system will be temporarily unavailable. Please plan your submissions accordingly.</p>',
        summary: 'Scheduled system downtime on 15 March',
        author_id: owner.id, company_id: company.id, category_id: categories[2].id,
        status: 'Published', priority: 'Normal', target_audience: 'All',
        published_at: new Date('2025-03-10'),
        public_id: uuidv4()
      },
      {
        title: 'Company Annual Dinner 2025',
        content: '<h2>Annual Dinner - Save the Date!</h2><p>We are pleased to announce that the Demo Corp Annual Dinner will be held on:</p><p><strong>Date:</strong> 28 June 2025 (Saturday)<br/><strong>Time:</strong> 7:00 PM<br/><strong>Venue:</strong> Grand Ballroom, Hilton KL</p><p>More details will follow. Mark your calendars!</p>',
        summary: 'Save the date for annual dinner on 28 June',
        author_id: users[1].id, company_id: company.id, category_id: categories[3].id,
        status: 'Published', priority: 'Low', target_audience: 'All',
        published_at: new Date('2025-03-05'),
        public_id: uuidv4()
      },
      {
        title: '[DRAFT] Q2 Performance Review Schedule',
        content: '<p>Performance reviews for Q2 will begin on 1 July 2025. Managers, please prepare your team assessments by 25 June.</p>',
        summary: 'Draft schedule for Q2 performance reviews',
        author_id: users[1].id, company_id: company.id, category_id: categories[1].id,
        status: 'Draft', priority: 'Normal', target_audience: 'All',
        public_id: uuidv4()
      },
      {
        title: 'New Claim Submission Deadline Reminder',
        content: '<p>Please be reminded that all claims for February 2025 must be submitted by <strong>10 March 2025</strong>. Late submissions will be processed in the following month.</p><p>Ensure all receipts are attached before submitting.</p>',
        summary: 'Deadline reminder for Feb 2025 claims',
        author_id: users[1].id, company_id: company.id, category_id: categories[1].id,
        status: 'Published', priority: 'High', target_audience: 'All',
        published_at: new Date('2025-03-03'),
        public_id: uuidv4()
      },
    ];

    const memos = [];
    for (const m of memosData) {
      const memo = await Memo.create(m, { transaction: t });
      memos.push(memo);
    }
    console.log(`+ Created ${memos.length} memos/announcements`);

    // Read receipts for published memos
    for (const memo of memos.filter(m => m.status === 'Published')) {
      const readCount = Math.floor(Math.random() * 6) + 4;
      for (let i = 0; i < Math.min(readCount, activeEmployees.length); i++) {
        await MemoReadReceipt.findOrCreate({
          where: { memo_id: memo.id, employee_id: activeEmployees[i].id },
          defaults: {
            memo_id: memo.id,
            employee_id: activeEmployees[i].id,
            read_at: randomDate(new Date(memo.published_at), new Date()),
            acknowledged_at: memo.requires_acknowledgment && Math.random() > 0.3
              ? randomDate(new Date(memo.published_at), new Date()) : null
          },
          transaction: t
        });
      }
    }
    console.log('  + Added memo read receipts');

    // ═══════════════════════════════════════════════════════════════════
    // 14. POLICIES
    // ═══════════════════════════════════════════════════════════════════
    const policiesData = [
      {
        policy_code: 'DEMO-HR-001', title: 'Employee Code of Conduct',
        description: 'Guidelines for professional behavior and conduct in the workplace.',
        content: '<h2>Code of Conduct</h2><p>All employees are expected to maintain professional behavior at all times. This includes: punctuality, respect for colleagues, proper use of company resources, and adherence to company policies.</p>',
        category: 'HR', version: '1.0', status: 'Active',
        author_id: owner.id, approved_by: owner.id, approved_at: new Date('2025-01-01'),
        effective_from: '2025-01-01', requires_acknowledgment: true,
        public_id: uuidv4()
      },
      {
        policy_code: 'DEMO-IT-001', title: 'IT Security Policy',
        description: 'Information security guidelines and acceptable use of IT resources.',
        content: '<h2>IT Security</h2><p>All employees must follow these security guidelines:</p><ul><li>Use strong passwords (min 12 chars)</li><li>Enable 2FA on all accounts</li><li>Do not share credentials</li><li>Report suspicious emails to IT</li></ul>',
        category: 'IT', version: '1.0', status: 'Active',
        author_id: owner.id, approved_by: owner.id, approved_at: new Date('2025-01-01'),
        effective_from: '2025-01-01', requires_acknowledgment: true,
        public_id: uuidv4()
      },
      {
        policy_code: 'DEMO-FN-001', title: 'Expense Reimbursement Policy',
        description: 'Guidelines for claiming and processing expense reimbursements.',
        content: '<h2>Expense Reimbursement</h2><p>Claims must be submitted within 30 days of expense. Original receipts required for claims above RM50. Multi-level approval: Manager → Finance → Payment.</p>',
        category: 'Finance', version: '1.0', status: 'Active',
        author_id: owner.id, effective_from: '2025-01-01',
        public_id: uuidv4()
      },
      {
        policy_code: 'DEMO-HR-002', title: 'Work From Home Policy',
        description: 'Guidelines for WFH arrangements and approval process.',
        content: '<h2>WFH Policy</h2><p>Employees may apply for WFH up to 2 days per week with manager approval. Must maintain availability during core hours (10 AM - 4 PM).</p>',
        category: 'HR', version: '1.0', status: 'Draft',
        author_id: users[1].id,
        public_id: uuidv4()
      },
    ];

    const policies = [];
    for (const p of policiesData) {
      const policy = await Policy.create(p, { transaction: t });
      policies.push(policy);
    }
    console.log(`+ Created ${policies.length} policies`);

    // Policy acknowledgments from all active employees
    for (const policy of policies.filter(p => p.status === 'Active' && p.requires_acknowledgment)) {
      for (const emp of activeEmployees.slice(0, 10)) {
        await PolicyAcknowledgment.findOrCreate({
          where: { policy_id: policy.id, employee_id: emp.id, policy_version: policy.version },
          defaults: {
            policy_id: policy.id,
            employee_id: emp.id,
            viewed_at: randomDate(new Date('2025-01-05'), new Date()),
            acknowledged_at: Math.random() > 0.2 ? randomDate(new Date('2025-01-05'), new Date()) : null,
            policy_version: policy.version
          },
          transaction: t
        });
      }
    }
    console.log('  + Added policy acknowledgments');

    // ═══════════════════════════════════════════════════════════════════
    // 15. PUBLIC HOLIDAYS (Malaysia 2025)
    // ═══════════════════════════════════════════════════════════════════
    const holidays = [
      { name: 'New Year\'s Day', date: '2025-01-01' },
      { name: 'Thaipusam', date: '2025-01-11' },
      { name: 'Federal Territory Day', date: '2025-02-01' },
      { name: 'Nuzul Al-Quran', date: '2025-03-17' },
      { name: 'Hari Raya Aidilfitri', date: '2025-03-31' },
      { name: 'Hari Raya Aidilfitri (2nd Day)', date: '2025-04-01' },
      { name: 'Labour Day', date: '2025-05-01' },
      { name: 'Vesak Day', date: '2025-05-12' },
      { name: 'Agong Birthday', date: '2025-06-02' },
      { name: 'Hari Raya Haji', date: '2025-06-07' },
      { name: 'Hari Raya Haji (2nd Day)', date: '2025-06-08' },
      { name: 'Awal Muharram', date: '2025-06-27' },
      { name: 'Malaysia Day', date: '2025-09-16' },
      { name: 'Mawlid Nabi', date: '2025-09-05' },
      { name: 'Deepavali', date: '2025-10-20' },
      { name: 'Christmas Day', date: '2025-12-25' },
    ];

    for (const h of holidays) {
      await PublicHoliday.findOrCreate({
        where: { company_id: company.id, name: h.name, date: h.date },
        defaults: { company_id: company.id, ...h, is_recurring: true },
        transaction: t
      });
    }
    console.log(`+ Created ${holidays.length} public holidays`);

    // ═══════════════════════════════════════════════════════════════════
    // 16. STATUTORY CONFIG
    // ═══════════════════════════════════════════════════════════════════
    const statConfigs = [
      { config_key: 'epf_employee_rate', config_value: '11', description: 'Employee EPF contribution %' },
      { config_key: 'epf_employer_rate', config_value: '13', description: 'Employer EPF contribution %' },
      { config_key: 'socso_employee_rate', config_value: '0.5', description: 'Employee SOCSO %' },
      { config_key: 'socso_employer_rate', config_value: '1.75', description: 'Employer SOCSO %' },
      { config_key: 'eis_employee_rate', config_value: '0.2', description: 'Employee EIS %' },
      { config_key: 'eis_employer_rate', config_value: '0.2', description: 'Employer EIS %' },
    ];

    for (const sc of statConfigs) {
      await StatutoryConfig.findOrCreate({
        where: { company_id: company.id, config_key: sc.config_key },
        defaults: { company_id: company.id, ...sc, effective_from: '2025-01-01' },
        transaction: t
      });
    }
    console.log(`+ Created ${statConfigs.length} statutory configs`);

    // ═══════════════════════════════════════════════════════════════════
    // 17. NOTIFICATIONS (comprehensive samples)
    // ═══════════════════════════════════════════════════════════════════
    const notificationsData = [
      // Staff notifications
      { user_id: users[2].id, company_id: company.id, type: 'leave_approved', title: 'Leave Approved', message: 'Your Annual Leave from 13 Jan to 17 Jan 2025 has been approved.', is_read: true, read_at: new Date('2025-01-07') },
      { user_id: users[3].id, company_id: company.id, type: 'leave_approved', title: 'Leave Approved', message: 'Your Medical Leave from 10 Feb to 11 Feb 2025 has been approved.', is_read: true, read_at: new Date('2025-02-10') },
      { user_id: users[3].id, company_id: company.id, type: 'claim_rejected', title: 'Claim Rejected', message: 'Your Meal claim of RM200.00 has been rejected. Reason: Not a business meal.', is_read: false },
      { user_id: users[4].id, company_id: company.id, type: 'leave_rejected', title: 'Leave Rejected', message: 'Your Annual Leave from 17-21 Mar 2025 has been rejected. Reason: Project deadline.', is_read: false },
      // Announcement notifications
      { user_id: users[2].id, company_id: company.id, type: 'announcement_published', title: 'New Announcement', message: 'A new announcement "Updated Leave Policy" has been published.', is_read: false },
      { user_id: users[7].id, company_id: company.id, type: 'announcement_published', title: 'New Announcement', message: 'A new announcement "Updated Leave Policy" has been published.', is_read: false },
      // Team member joined
      { user_id: owner.id, company_id: company.id, type: 'team_member_joined', title: 'New Team Member', message: 'Nurul Aisyah binti Kamal has joined the Engineering department.', is_read: true, read_at: new Date('2025-01-06') },
      // Manager pending notifications
      { user_id: managerUser1.id, company_id: company.id, type: 'leave_approved', title: 'Leave Pending Approval', message: 'Tan Wei Ming has applied for Annual Leave (14-18 Apr 2025). Pending your approval.', is_read: false },
      { user_id: managerUser1.id, company_id: company.id, type: 'leave_approved', title: 'Leave Pending Approval', message: 'Wong Kai Xin has applied for Annual Leave (7-9 Apr 2025). Pending your approval.', is_read: false },
      // New employee notifications
      { user_id: users[7].id, company_id: company.id, type: 'leave_approved', title: 'Leave Approved', message: 'Your Annual Leave from 27-29 Jan 2025 has been approved.', is_read: true, read_at: new Date('2025-01-21') },
      { user_id: users[9].id, company_id: company.id, type: 'claim_finance_approved', title: 'Claim Approved by Finance', message: 'Your Medical claim of RM320.00 has been approved by finance.', is_read: false },
      { user_id: users[10].id, company_id: company.id, type: 'leave_approved', title: 'Leave Approved', message: 'Your Annual Leave from 10-14 Feb 2025 has been approved.', is_read: true, read_at: new Date('2025-02-04') },
      { user_id: users[11].id, company_id: company.id, type: 'claim_rejected', title: 'Claim Rejected', message: 'Your Medical claim of RM450.00 (glasses) has been rejected.', is_read: false },
      { user_id: users[12].id, company_id: company.id, type: 'leave_approved', title: 'Leave Approved', message: 'Your Emergency Leave on 4 Mar 2025 has been approved.', is_read: true, read_at: new Date('2025-03-04') },
      { user_id: users[13].id, company_id: company.id, type: 'claim_approved', title: 'Claim Manager Approved', message: 'Your Travel claim of RM95.00 has been approved by your manager.', is_read: false },
      // WFH notifications
      { user_id: users[7].id, company_id: company.id, type: 'wfh_approved', title: 'WFH Approved', message: 'Your WFH application for 14 Mar 2025 has been approved.', is_read: true, read_at: new Date('2025-03-13') },
      { user_id: users[10].id, company_id: company.id, type: 'wfh_approved', title: 'WFH Approved', message: 'Your WFH application for 14 Mar 2025 has been approved.', is_read: false },
    ];

    for (const n of notificationsData) {
      await Notification.create(n, { transaction: t });
    }
    console.log(`+ Created ${notificationsData.length} notifications`);

    // ═══════════════════════════════════════════════════════════════════
    // COMMIT TRANSACTION
    // ═══════════════════════════════════════════════════════════════════
    await t.commit();

    // ═══════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✓ DEMO COMPANY SEEDED SUCCESSFULLY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n  Company:  ${DEMO_COMPANY_NAME}`);
    console.log(`  Owner:    ${OWNER_EMAIL}`);
    console.log(`  Password: ${DEFAULT_PASSWORD} (all demo accounts)`);
    console.log(`\n  Test Accounts:`);
    console.log('  ┌───────────────────────────────────┬──────────┬──────────────────────────────────┬───────────────────┐');
    console.log('  │ Email                             │ Role     │ Employee                         │ Department        │');
    console.log('  ├───────────────────────────────────┼──────────┼──────────────────────────────────┼───────────────────┤');
    for (let i = 0; i < staffData.length; i++) {
      const e = staffData[i].email.padEnd(33);
      const r = staffData[i].role.padEnd(8);
      const n = staffData[i].employee.full_name.substring(0, 30).padEnd(30);
      const d = staffData[i].employee.department.substring(0, 17).padEnd(17);
      console.log(`  │ ${e} │ ${r} │ ${n} │ ${d} │`);
    }
    console.log('  └───────────────────────────────────┴──────────┴──────────────────────────────────┴───────────────────┘');
    console.log('\n  Data Summary:');
    console.log(`    • ${activeEmployees.length} active employees + 1 resigned = ${employees.length} total`);
    console.log(`    • ${leaveTypes.length} leave types + entitlements for all active employees`);
    console.log(`    • ${claimTypes.length} claim types`);
    console.log(`    • ${leavesData.length} leave applications (approved/pending/rejected/half-day)`);
    console.log(`    • ${claimsData.length} claims (Pending/Manager_Approved/Finance_Approved/Paid/Rejected)`);
    console.log(`    • ${attendanceCount} attendance records (Feb-Mar 2025)`);
    console.log(`    • ${wfhData.length} WFH applications`);
    console.log(`    • ${payrollCount} payroll records + YTD statutory (Jan-Feb 2025)`);
    console.log(`    • ${memos.length} memos/announcements + read receipts`);
    console.log(`    • ${policies.length} policies + acknowledgments`);
    console.log(`    • ${holidays.length} public holidays (Malaysia 2025)`);
    console.log(`    • ${statConfigs.length} statutory configs`);
    console.log(`    • ${notificationsData.length} notifications`);
    console.log('\n  To reset and re-seed: node database/seeds/seed-demo-company.js --reset');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    await t.rollback();
    console.error('\n✗ Seed failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// ─── CLEANUP (for --reset) ─────────────────────────────────────────────
async function destroyDemoCompany(companyId, t) {
  // Get all employee IDs for this company
  const companyEmployees = await Employee.findAll({
    where: { company_id: companyId },
    attributes: ['id'],
    transaction: t
  });
  const empIds = companyEmployees.map(e => e.id);

  // Get all memo IDs for this company
  const companyMemos = await Memo.findAll({
    where: { company_id: companyId },
    attributes: ['id'],
    transaction: t
  });
  const memoIds = companyMemos.map(m => m.id);

  // Get all policy IDs authored by company users
  const companyPolicies = await Policy.findAll({
    attributes: ['id'],
    transaction: t,
    include: [{ model: User, as: 'author', where: { company_id: companyId }, attributes: [] }]
  }).catch(() => []);
  const policyIds = companyPolicies.map(p => p.id);

  // Delete in dependency order (children first)
  if (empIds.length > 0) {
    await PolicyAcknowledgment.destroy({ where: { employee_id: { [Op.in]: empIds } }, transaction: t }).catch(() => {});
    await MemoReadReceipt.destroy({ where: { employee_id: { [Op.in]: empIds } }, transaction: t }).catch(() => {});
    await YTDStatutory.destroy({ where: { employee_id: { [Op.in]: empIds } }, transaction: t });
    await Payroll.destroy({ where: { employee_id: { [Op.in]: empIds } }, transaction: t });
    await WFHApplication.destroy({ where: { employee_id: { [Op.in]: empIds } }, transaction: t });
    await Attendance.destroy({ where: { employee_id: { [Op.in]: empIds } }, transaction: t });
    await Claim.destroy({ where: { employee_id: { [Op.in]: empIds } }, transaction: t });
    await Leave.destroy({ where: { employee_id: { [Op.in]: empIds } }, transaction: t });
    await LeaveEntitlement.destroy({ where: { employee_id: { [Op.in]: empIds } }, transaction: t });
  }
  if (memoIds.length > 0) {
    await MemoReadReceipt.destroy({ where: { memo_id: { [Op.in]: memoIds } }, transaction: t }).catch(() => {});
  }
  if (policyIds.length > 0) {
    await PolicyAcknowledgment.destroy({ where: { policy_id: { [Op.in]: policyIds } }, transaction: t }).catch(() => {});
    await Policy.destroy({ where: { id: { [Op.in]: policyIds } }, transaction: t }).catch(() => {});
  }

  await Notification.destroy({ where: { company_id: companyId }, transaction: t });
  await Memo.destroy({ where: { company_id: companyId }, transaction: t });
  await AnnouncementCategory.destroy({ where: { company_id: companyId }, transaction: t });
  await FileModel.destroy({ where: { company_id: companyId }, transaction: t });
  await ClaimType.destroy({ where: { company_id: companyId }, transaction: t });
  await LeaveType.destroy({ where: { company_id: companyId }, transaction: t });
  await StatutoryConfig.destroy({ where: { company_id: companyId }, transaction: t });
  await PublicHoliday.destroy({ where: { company_id: companyId }, transaction: t });
  await UserCompany.destroy({ where: { company_id: companyId }, transaction: t });

  // Clear reporting_manager_id before deleting employees
  await Employee.update(
    { reporting_manager_id: null },
    { where: { company_id: companyId }, transaction: t }
  );
  await Employee.destroy({ where: { company_id: companyId }, transaction: t });

  // Delete demo-only users (@example.com), NOT the owner
  await User.destroy({ where: { email: { [Op.like]: '%@example.com' } }, transaction: t });

  await Company.destroy({ where: { id: companyId }, transaction: t });
}

seedDemoCompany();
