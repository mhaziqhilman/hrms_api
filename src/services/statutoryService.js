const { roundToTwo } = require('../utils/helpers');

/**
 * Malaysian Statutory Calculations Service
 * Handles EPF, SOCSO, EIS, and PCB calculations
 */

/**
 * Calculate EPF (Employees Provident Fund) contribution
 * @param {Number} salary - Monthly salary
 * @param {Number} age - Employee age
 * @returns {Object} EPF breakdown
 */
const calculateEPF = (salary, age = 30) => {
  // EPF exemption for age > 60
  if (age > 60) {
    return {
      employee: 0,
      employer: 0,
      total: 0
    };
  }

  // Maximum salary cap for EPF
  const cappedSalary = Math.min(salary, 30000);

  // Employee contribution: 11%
  const employeeEPF = roundToTwo(cappedSalary * 0.11);

  // Employer contribution
  let employerEPF;
  if (cappedSalary <= 5000) {
    employerEPF = roundToTwo(cappedSalary * 0.13); // 13% for salary <= RM5,000
  } else {
    employerEPF = roundToTwo(cappedSalary * 0.12); // 12% for salary > RM5,000
  }

  return {
    employee: employeeEPF,
    employer: employerEPF,
    total: roundToTwo(employeeEPF + employerEPF)
  };
};

/**
 * SOCSO Contribution Table (34 tiers)
 * Returns SOCSO contribution based on salary tier
 * @param {Number} salary - Monthly salary
 * @param {Number} age - Employee age
 * @returns {Object} SOCSO breakdown
 */
const calculateSOCSO = (salary, age = 30) => {
  // SOCSO only applicable for salary <= RM5,000 and age <= 60
  if (salary > 5000 || age > 60) {
    return {
      employee: 0,
      employer: 0,
      total: 0
    };
  }

  // Simplified SOCSO table (actual implementation should use full 34-tier table)
  const socsoTable = [
    { max: 500, employee: 2.50, employer: 7.00 },
    { max: 1000, employee: 5.00, employer: 14.00 },
    { max: 1500, employee: 7.50, employer: 21.00 },
    { max: 2000, employee: 10.00, employer: 28.00 },
    { max: 2500, employee: 12.50, employer: 35.00 },
    { max: 3000, employee: 15.00, employer: 42.00 },
    { max: 3500, employee: 17.50, employer: 49.00 },
    { max: 4000, employee: 20.00, employer: 56.00 },
    { max: 4500, employee: 22.50, employer: 63.00 },
    { max: 5000, employee: 25.00, employer: 70.00 }
  ];

  let tier = socsoTable.find(t => salary <= t.max);
  if (!tier) {
    tier = socsoTable[socsoTable.length - 1];
  }

  return {
    employee: tier.employee,
    employer: tier.employer,
    total: roundToTwo(tier.employee + tier.employer)
  };
};

/**
 * Calculate EIS (Employment Insurance System) contribution
 * @param {Number} salary - Monthly salary
 * @returns {Object} EIS breakdown
 */
const calculateEIS = (salary) => {
  // Maximum salary cap for EIS
  const cappedSalary = Math.min(salary, 5000);

  // Both employee and employer: 0.2%
  const employeeEIS = roundToTwo(cappedSalary * 0.002);
  const employerEIS = roundToTwo(cappedSalary * 0.002);

  return {
    employee: employeeEIS,
    employer: employerEIS,
    total: roundToTwo(employeeEIS + employerEIS)
  };
};

/**
 * Calculate PCB (Monthly Tax Deduction)
 * Simplified PCB calculation - actual implementation should use LHDN PCB tables
 * @param {Number} monthlyGross - Monthly gross salary
 * @param {Number} epfContribution - Employee EPF contribution
 * @param {String} taxCategory - Tax relief category
 * @returns {Number} PCB amount
 */
const calculatePCB = (monthlyGross, epfContribution, taxCategory = 'Individual') => {
  // Calculate chargeable income (after EPF deduction)
  const chargeableIncome = monthlyGross - epfContribution;

  // Simplified PCB calculation (actual implementation should use official LHDN tables)
  // This is a rough approximation
  let pcb = 0;

  if (chargeableIncome <= 2000) {
    pcb = 0;
  } else if (chargeableIncome <= 3000) {
    pcb = (chargeableIncome - 2000) * 0.01;
  } else if (chargeableIncome <= 5000) {
    pcb = 10 + (chargeableIncome - 3000) * 0.03;
  } else if (chargeableIncome <= 7000) {
    pcb = 70 + (chargeableIncome - 5000) * 0.08;
  } else if (chargeableIncome <= 10000) {
    pcb = 230 + (chargeableIncome - 7000) * 0.13;
  } else if (chargeableIncome <= 15000) {
    pcb = 620 + (chargeableIncome - 10000) * 0.19;
  } else {
    pcb = 1570 + (chargeableIncome - 15000) * 0.25;
  }

  return roundToTwo(pcb);
};

/**
 * Calculate all statutory contributions
 * @param {Number} salary - Monthly gross salary
 * @param {Number} age - Employee age
 * @param {String} taxCategory - Tax relief category
 * @returns {Object} Complete statutory breakdown
 */
const calculateAllStatutory = (salary, age = 30, taxCategory = 'Individual') => {
  const epf = calculateEPF(salary, age);
  const socso = calculateSOCSO(salary, age);
  const eis = calculateEIS(salary);
  const pcb = calculatePCB(salary, epf.employee, taxCategory);

  const totalEmployeeDeduction = roundToTwo(
    epf.employee + socso.employee + eis.employee + pcb
  );

  const totalEmployerContribution = roundToTwo(
    epf.employer + socso.employer + eis.employer
  );

  const netSalary = roundToTwo(salary - totalEmployeeDeduction);

  return {
    grossSalary: salary,
    epf,
    socso,
    eis,
    pcb,
    totalEmployeeDeduction,
    totalEmployerContribution,
    netSalary
  };
};

module.exports = {
  calculateEPF,
  calculateSOCSO,
  calculateEIS,
  calculatePCB,
  calculateAllStatutory
};
