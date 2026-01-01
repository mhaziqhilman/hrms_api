/**
 * Malaysian Statutory Calculations
 * EPF, SOCSO, EIS, and PCB (Income Tax) calculations
 * Based on 2024/2025 Malaysian statutory rates
 */

/**
 * Calculate EPF (Employees Provident Fund) contributions
 * Employee: 11% of monthly wages
 * Employer: 12% or 13% depending on salary
 */
const calculateEPF = (monthlySalary) => {
  const employeeRate = 0.11; // 11%
  const employerRate = monthlySalary <= 5000 ? 0.13 : 0.12; // 13% if ≤RM5000, else 12%

  return {
    employee: Math.round(monthlySalary * employeeRate * 100) / 100,
    employer: Math.round(monthlySalary * employerRate * 100) / 100
  };
};

/**
 * Calculate SOCSO (Social Security Organization) contributions
 * Based on monthly salary brackets
 * Maximum salary for SOCSO: RM5,000
 */
const calculateSOCSO = (monthlySalary) => {
  if (monthlySalary > 5000) {
    // Maximum contribution for salary > RM5000
    return {
      employee: 39.25,
      employer: 87.05
    };
  }

  // SOCSO contribution table (simplified - should use full table in production)
  const socsoTable = [
    { min: 0, max: 30, employee: 0.10, employer: 0.40 },
    { min: 30, max: 50, employee: 0.20, employer: 0.70 },
    { min: 50, max: 70, employee: 0.30, employer: 1.10 },
    { min: 70, max: 100, employee: 0.40, employer: 1.50 },
    { min: 100, max: 140, employee: 0.60, employer: 2.10 },
    { min: 140, max: 200, employee: 0.85, employer: 3.00 },
    { min: 200, max: 300, employee: 1.25, employer: 4.45 },
    { min: 300, max: 400, employee: 1.75, employer: 6.15 },
    { min: 400, max: 500, employee: 2.25, employer: 7.90 },
    { min: 500, max: 600, employee: 2.75, employer: 9.65 },
    { min: 600, max: 700, employee: 3.25, employer: 11.40 },
    { min: 700, max: 800, employee: 3.75, employer: 13.15 },
    { min: 800, max: 900, employee: 4.25, employer: 14.90 },
    { min: 900, max: 1000, employee: 4.75, employer: 16.65 },
    { min: 1000, max: 1100, employee: 5.25, employer: 18.40 },
    { min: 1100, max: 1200, employee: 5.75, employer: 20.15 },
    { min: 1200, max: 1300, employee: 6.25, employer: 21.90 },
    { min: 1300, max: 1400, employee: 6.75, employer: 23.65 },
    { min: 1400, max: 1500, employee: 7.25, employer: 25.40 },
    { min: 1500, max: 1600, employee: 7.75, employer: 27.15 },
    { min: 1600, max: 1700, employee: 8.25, employer: 28.90 },
    { min: 1700, max: 1800, employee: 8.75, employer: 30.65 },
    { min: 1800, max: 1900, employee: 9.25, employer: 32.40 },
    { min: 1900, max: 2000, employee: 9.75, employer: 34.15 },
    { min: 2000, max: 2100, employee: 10.25, employer: 35.90 },
    { min: 2100, max: 2200, employee: 10.75, employer: 37.65 },
    { min: 2200, max: 2300, employee: 11.25, employer: 39.40 },
    { min: 2300, max: 2400, employee: 11.75, employer: 41.15 },
    { min: 2400, max: 2500, employee: 12.25, employer: 42.90 },
    { min: 2500, max: 2600, employee: 12.75, employer: 44.65 },
    { min: 2600, max: 2700, employee: 13.25, employer: 46.40 },
    { min: 2700, max: 2800, employee: 13.75, employer: 48.15 },
    { min: 2800, max: 2900, employee: 14.25, employer: 49.90 },
    { min: 2900, max: 3000, employee: 14.75, employer: 51.65 },
    { min: 3000, max: 3100, employee: 15.25, employer: 53.40 },
    { min: 3100, max: 3200, employee: 15.75, employer: 55.15 },
    { min: 3200, max: 3300, employee: 16.25, employer: 56.90 },
    { min: 3300, max: 3400, employee: 16.75, employer: 58.65 },
    { min: 3400, max: 3500, employee: 17.25, employer: 60.40 },
    { min: 3500, max: 3600, employee: 17.75, employer: 62.15 },
    { min: 3600, max: 3700, employee: 18.25, employer: 63.90 },
    { min: 3700, max: 3800, employee: 18.75, employer: 65.65 },
    { min: 3800, max: 3900, employee: 19.25, employer: 67.40 },
    { min: 3900, max: 4000, employee: 19.75, employer: 69.15 },
    { min: 4000, max: 4100, employee: 20.25, employer: 70.90 },
    { min: 4100, max: 4200, employee: 20.75, employer: 72.65 },
    { min: 4200, max: 4300, employee: 21.25, employer: 74.40 },
    { min: 4300, max: 4400, employee: 21.75, employer: 76.15 },
    { min: 4400, max: 4500, employee: 22.25, employer: 77.90 },
    { min: 4500, max: 4600, employee: 22.75, employer: 79.65 },
    { min: 4600, max: 4700, employee: 23.25, employer: 81.40 },
    { min: 4700, max: 4800, employee: 23.75, employer: 83.15 },
    { min: 4800, max: 4900, employee: 24.25, employer: 84.90 },
    { min: 4900, max: 5000, employee: 24.75, employer: 86.65 }
  ];

  const bracket = socsoTable.find(b => monthlySalary >= b.min && monthlySalary < b.max);

  if (bracket) {
    return {
      employee: bracket.employee,
      employer: bracket.employer
    };
  }

  return { employee: 0, employer: 0 };
};

/**
 * Calculate EIS (Employment Insurance System) contributions
 * Employee: 0.2% of monthly wages
 * Employer: 0.2% of monthly wages
 * Maximum salary for EIS: RM4,000
 */
const calculateEIS = (monthlySalary) => {
  const maxSalary = 4000;
  const contributionSalary = Math.min(monthlySalary, maxSalary);
  const rate = 0.002; // 0.2%

  const contribution = Math.round(contributionSalary * rate * 100) / 100;

  return {
    employee: contribution,
    employer: contribution
  };
};

/**
 * Calculate PCB (Potongan Cukai Berjadual / Monthly Tax Deduction)
 * Simplified calculation - in production, use LHDN's PCB tables
 * This is a rough estimate based on annual tax brackets
 */
const calculatePCB = (monthlySalary, hasEPF = true) => {
  const annualSalary = monthlySalary * 12;

  // EPF deduction (if applicable)
  const epfDeduction = hasEPF ? monthlySalary * 12 * 0.11 : 0;
  const chargeableIncome = annualSalary - epfDeduction - 9000; // RM9000 personal relief

  if (chargeableIncome <= 0) return 0;

  // Simplified Malaysian tax brackets 2024
  let tax = 0;
  if (chargeableIncome <= 5000) {
    tax = 0;
  } else if (chargeableIncome <= 20000) {
    tax = (chargeableIncome - 5000) * 0.01;
  } else if (chargeableIncome <= 35000) {
    tax = 150 + (chargeableIncome - 20000) * 0.03;
  } else if (chargeableIncome <= 50000) {
    tax = 600 + (chargeableIncome - 35000) * 0.08;
  } else if (chargeableIncome <= 70000) {
    tax = 1800 + (chargeableIncome - 50000) * 0.13;
  } else if (chargeableIncome <= 100000) {
    tax = 4400 + (chargeableIncome - 70000) * 0.21;
  } else if (chargeableIncome <= 250000) {
    tax = 10700 + (chargeableIncome - 100000) * 0.24;
  } else if (chargeableIncome <= 400000) {
    tax = 46700 + (chargeableIncome - 250000) * 0.245;
  } else if (chargeableIncome <= 600000) {
    tax = 83450 + (chargeableIncome - 400000) * 0.25;
  } else if (chargeableIncome <= 1000000) {
    tax = 133450 + (chargeableIncome - 600000) * 0.26;
  } else {
    tax = 237450 + (chargeableIncome - 1000000) * 0.28;
  }

  // Monthly PCB (rough estimate)
  const monthlyPCB = Math.round((tax / 12) * 100) / 100;

  return monthlyPCB;
};

/**
 * Calculate all statutory deductions
 */
const calculateAllStatutory = (monthlySalary, options = {}) => {
  const { hasEPF = true, hasSOCSO = true, hasEIS = true, hasPCB = true } = options;

  const epf = hasEPF ? calculateEPF(monthlySalary) : { employee: 0, employer: 0 };
  const socso = hasSOCSO ? calculateSOCSO(monthlySalary) : { employee: 0, employer: 0 };
  const eis = hasEIS ? calculateEIS(monthlySalary) : { employee: 0, employer: 0 };
  const pcb = hasPCB ? calculatePCB(monthlySalary, hasEPF) : 0;

  const totalEmployeeDeduction = epf.employee + socso.employee + eis.employee + pcb;
  const totalEmployerContribution = epf.employer + socso.employer + eis.employer;

  return {
    epf,
    socso,
    eis,
    pcb,
    totalEmployeeDeduction: Math.round(totalEmployeeDeduction * 100) / 100,
    totalEmployerContribution: Math.round(totalEmployerContribution * 100) / 100
  };
};

module.exports = {
  calculateEPF,
  calculateSOCSO,
  calculateEIS,
  calculatePCB,
  calculateAllStatutory
};
