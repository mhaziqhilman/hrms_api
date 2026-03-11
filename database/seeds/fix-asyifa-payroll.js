/**
 * Fix Asyifa binti Abd Malik (AVS004) payroll records
 * Overwrite inconsistent net salary to RM 5499.15 across all months
 *
 * For RM 6500 gross:
 *   EPF employee = 715.00
 *   SOCSO employee = 29.75
 *   EIS employee = 11.90
 *   PCB = 244.20
 *   Total deductions = 1000.85
 *   Net salary = 5499.15
 *
 * Usage: node database/seeds/fix-asyifa-payroll.js
 */

require('dotenv').config();
const { sequelize } = require('../../src/config/database');
const Payroll = require('../../src/models/Payroll');
const Employee = require('../../src/models/Employee');
const { Op } = require('sequelize');

async function fixPayroll() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    // Find Asyifa by employee_id AVS004
    const employee = await Employee.findOne({
      where: { employee_id: 'AVS004' }
    });

    if (!employee) {
      console.error('Employee AVS004 not found!');
      process.exit(1);
    }

    console.log(`Found employee: ${employee.full_name} (ID: ${employee.id})`);

    // Find all her payroll records that are inconsistent
    const payrolls = await Payroll.findAll({
      where: {
        employee_id: employee.id,
        net_salary: { [Op.ne]: 5499.15 }
      },
      order: [['year', 'ASC'], ['month', 'ASC']]
    });

    console.log(`Found ${payrolls.length} inconsistent payroll records to fix.`);

    for (const payroll of payrolls) {
      const oldNet = parseFloat(payroll.net_salary);
      const oldDeductions = parseFloat(payroll.total_deductions);
      const oldPcb = parseFloat(payroll.pcb_deduction);

      // Correct values
      const correctPcb = 244.20;
      const correctTotalDeductions = 1000.85;
      const correctNetSalary = 5499.15;

      await payroll.update({
        pcb_deduction: correctPcb,
        total_deductions: correctTotalDeductions,
        net_salary: correctNetSalary
      });

      console.log(
        `  Fixed ${payroll.month}/${payroll.year}: ` +
        `PCB ${oldPcb} -> ${correctPcb}, ` +
        `Deductions ${oldDeductions} -> ${correctTotalDeductions}, ` +
        `Net ${oldNet} -> ${correctNetSalary}`
      );
    }

    console.log('\nDone! All payroll records for Asyifa are now consistent at RM 5499.15.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

fixPayroll();
