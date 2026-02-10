/**
 * Seed script - populates default leave types, claim types, and initial super_admin user.
 * Run once after Sequelize sync creates the schema.
 *
 * Usage: node database/seeds/run-seed.js
 */
require('dotenv').config();
const { sequelize, User, LeaveType, ClaimType } = require('../../src/models');

async function seed() {
  try {
    await sequelize.authenticate();
    console.log('✓ Connected to database');

    // Seed leave types
    const leaveTypes = [
      { name: 'Annual Leave', days_per_year: 14, is_paid: true, carry_forward_allowed: true, carry_forward_max_days: 7, prorate_for_new_joiners: true, requires_document: false, description: 'Annual leave entitlement' },
      { name: 'Medical Leave', days_per_year: 14, is_paid: true, carry_forward_allowed: false, carry_forward_max_days: 0, prorate_for_new_joiners: false, requires_document: true, description: 'Medical leave with medical certificate' },
      { name: 'Emergency Leave', days_per_year: 5, is_paid: true, carry_forward_allowed: false, carry_forward_max_days: 0, prorate_for_new_joiners: false, requires_document: false, description: 'Emergency personal leave' },
      { name: 'Unpaid Leave', days_per_year: 0, is_paid: false, carry_forward_allowed: false, carry_forward_max_days: 0, prorate_for_new_joiners: false, requires_document: false, description: 'Unpaid leave' },
    ];

    for (const lt of leaveTypes) {
      const [record, created] = await LeaveType.findOrCreate({ where: { name: lt.name }, defaults: lt });
      console.log(`  ${created ? '+ Created' : '~ Exists'} leave type: ${record.name}`);
    }

    // Seed claim types
    const claimTypes = [
      { name: 'Medical', per_claim_limit: 500.00, monthly_limit: 1000.00, annual_limit: 5000.00, requires_receipt: true, description: 'Medical expenses claim' },
      { name: 'Travel', per_claim_limit: 200.00, monthly_limit: 1000.00, annual_limit: 10000.00, requires_receipt: true, description: 'Travel expenses for business purposes' },
      { name: 'Meal', per_claim_limit: 50.00, monthly_limit: 500.00, annual_limit: 3000.00, requires_receipt: true, description: 'Meal allowance for overtime/business' },
      { name: 'Parking', per_claim_limit: 30.00, monthly_limit: 300.00, annual_limit: 2000.00, requires_receipt: true, description: 'Parking fees for business purposes' },
    ];

    for (const ct of claimTypes) {
      const [record, created] = await ClaimType.findOrCreate({ where: { name: ct.name }, defaults: ct });
      console.log(`  ${created ? '+ Created' : '~ Exists'} claim type: ${record.name}`);
    }

    // Seed initial super_admin user
    const adminEmail = 'admin@nextura.com';
    const [adminUser, created] = await User.findOrCreate({
      where: { email: adminEmail },
      defaults: {
        email: adminEmail,
        password: 'Admin@1234',  // Will be bcrypt-hashed by model hook
        role: 'super_admin',
        is_active: true
      }
    });
    console.log(`  ${created ? '+ Created' : '~ Exists'} super_admin: ${adminUser.email}`);
    if (created) {
      console.log('\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  Super Admin Login Credentials:');
      console.log(`  Email:    ${adminEmail}`);
      console.log('  Password: Admin@1234');
      console.log('  ** Change this password after first login! **');
      console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    console.log('\n✓ Seed completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Seed failed:', error.message);
    process.exit(1);
  }
}

seed();
