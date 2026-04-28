/**
 * UAT Seed Script
 * Creates 3 UAT users (admin, manager, staff) linked to a UAT company,
 * plus one employee record each with manager->staff reporting line.
 *
 * Usage (from HRMS-API_v1):
 *   node database/seeds/seed-uat-users.js
 *
 * Safe to re-run — upserts by email.
 */
require('dotenv').config();
const { sequelize, User, Employee, Company, UserCompany } = require('../../src/models');

const UAT_COMPANY = {
  name: 'UAT Test Company',
  registration_no: 'UAT-2026-001',
  industry: 'Technology',
  size: '11-50',
  country: 'Malaysia',
};

const USERS = [
  {
    email: 'uat.admin@nextura.test',
    password: 'Uat@12345',
    full_name: 'UAT Admin',
    role: 'admin',
    employee_id: 'UAT-ADM-001',
    gender: 'Male',
    basic_salary: 8000,
    department: 'Administration',
    position: 'HR Admin',
  },
  {
    email: 'uat.manager@nextura.test',
    password: 'Uat@12345',
    full_name: 'UAT Manager',
    role: 'manager',
    employee_id: 'UAT-MGR-001',
    gender: 'Female',
    basic_salary: 6500,
    department: 'Engineering',
    position: 'Engineering Manager',
  },
  {
    email: 'uat.staff@nextura.test',
    password: 'Uat@12345',
    full_name: 'UAT Staff',
    role: 'staff',
    employee_id: 'UAT-STF-001',
    gender: 'Male',
    basic_salary: 4500,
    department: 'Engineering',
    position: 'Software Engineer',
    reports_to: 'UAT-MGR-001',
  },
];

async function upsertCompany(ownerUser) {
  let company = await Company.findOne({ where: { registration_no: UAT_COMPANY.registration_no } });
  if (!company) {
    company = await Company.create({ ...UAT_COMPANY, owner_id: ownerUser.id });
    console.log(`  ✓ Company created: ${company.name} (id=${company.id})`);
  } else {
    if (!company.owner_id) await company.update({ owner_id: ownerUser.id });
    console.log(`  → Company exists: ${company.name} (id=${company.id})`);
  }
  return company;
}

async function ensureOwnerUser(def) {
  let user = await User.findOne({ where: { email: def.email } });
  if (!user) {
    user = await User.create({
      email: def.email,
      password: def.password,
      role: def.role,
      email_verified: true,
    });
    console.log(`  ✓ Owner user created: ${user.email}`);
  } else {
    user.password = def.password;
    await user.save();
    await user.update({ role: def.role, email_verified: true });
    console.log(`  → Owner user exists: ${user.email}`);
  }
  return user;
}

async function upsertUser(def, company) {
  let user = await User.findOne({ where: { email: def.email } });
  if (!user) {
    user = await User.create({
      email: def.email,
      password: def.password,
      role: def.role,
      company_id: company.id,
      email_verified: true,
    });
    console.log(`  ✓ User created: ${user.email} (role=${user.role})`);
  } else {
    await user.update({
      role: def.role,
      company_id: company.id,
      email_verified: true,
    });
    // reset password to known value
    user.password = def.password;
    await user.save();
    console.log(`  → User updated: ${user.email} (role=${user.role})`);
  }

  // Ensure UserCompany link
  const [uc] = await UserCompany.findOrCreate({
    where: { user_id: user.id, company_id: company.id },
    defaults: { role: def.role, joined_at: new Date() },
  });
  if (uc) await uc.update({ role: def.role });

  return user;
}

async function upsertEmployee(def, user, company, managerEmployeeId = null) {
  let employee = await Employee.findOne({
    where: { employee_id: def.employee_id, company_id: company.id },
  });

  const fields = {
    employee_id: def.employee_id,
    full_name: def.full_name,
    gender: def.gender,
    basic_salary: def.basic_salary,
    department: def.department,
    position: def.position,
    join_date: '2025-01-01',
    status: 'Active',
    user_id: user.id,
    company_id: company.id,
  };

  if (!employee) {
    employee = await Employee.create(fields);
    console.log(`  ✓ Employee created: ${employee.employee_id}`);
  } else {
    await employee.update(fields);
    console.log(`  → Employee updated: ${employee.employee_id}`);
  }

  // Link user.employee_id for legacy code paths
  if (user.employee_id !== employee.id) {
    await user.update({ employee_id: employee.id });
  }

  return employee;
}

async function linkReportingManager(staffEmployee, managerEmployee) {
  if (!staffEmployee || !managerEmployee) return;
  if (staffEmployee.reporting_manager_id === managerEmployee.id) return;
  await staffEmployee.update({ reporting_manager_id: managerEmployee.id });
  console.log(`  ✓ Linked ${staffEmployee.employee_id} -> manager ${managerEmployee.employee_id}`);
}

async function main() {
  console.log('\n=== UAT Seed Script ===\n');
  await sequelize.authenticate();
  console.log('  ✓ DB connected\n');

  console.log('[1/3] Company + Owner');
  const adminDef = USERS.find((u) => u.role === 'admin');
  const owner = await ensureOwnerUser(adminDef);
  const company = await upsertCompany(owner);

  console.log('\n[2/3] Users + Employees');
  const created = {};
  for (const def of USERS) {
    const user = await upsertUser(def, company);
    const employee = await upsertEmployee(def, user, company);
    created[def.employee_id] = { user, employee, def };
  }

  console.log('\n[3/3] Reporting relationships');
  const staff = created['UAT-STF-001'];
  const manager = created['UAT-MGR-001'];
  if (staff && manager) {
    await linkReportingManager(staff.employee, manager.employee);
  }

  console.log('\n=== Summary ===');
  console.log(`Company: ${company.name} (id=${company.id})`);
  Object.values(created).forEach(({ user, employee, def }) => {
    console.log(`  ${def.role.padEnd(8)} ${user.email.padEnd(32)} emp=${employee.employee_id}`);
  });
  console.log('\n✓ UAT seed completed.\n');

  await sequelize.close();
}

main().catch((err) => {
  console.error('\n✗ UAT seed failed:', err.message);
  console.error(err);
  process.exit(1);
});
