/**
 * Malaysian Statutory Calculations
 * EPF, SOCSO, EIS, and PCB (Income Tax) calculations
 * Based on 2024/2025/2026 Malaysian statutory rates
 * SOCSO & EIS tables updated for Oct 2024 wage ceiling increase (RM5,000 → RM6,000)
 * PCB uses full LHDN computerised calculation algorithm (e-CP39)
 */

// ============================================================================
// SOCSO (PERKESO) Category 1 Contribution Table
// Employment Injury Scheme + Invalidity Scheme (employees under 60)
// Effective 1 October 2024 (65-tier, wage ceiling RM6,000)
// ============================================================================
const SOCSO_TABLE = [
  { min: 0,       max: 30,    employee: 0.10,  employer: 0.40  },
  { min: 30.01,   max: 50,    employee: 0.20,  employer: 0.70  },
  { min: 50.01,   max: 70,    employee: 0.30,  employer: 1.10  },
  { min: 70.01,   max: 100,   employee: 0.40,  employer: 1.50  },
  { min: 100.01,  max: 140,   employee: 0.60,  employer: 2.10  },
  { min: 140.01,  max: 200,   employee: 0.85,  employer: 2.95  },
  { min: 200.01,  max: 300,   employee: 1.25,  employer: 4.35  },
  { min: 300.01,  max: 400,   employee: 1.75,  employer: 6.15  },
  { min: 400.01,  max: 500,   employee: 2.25,  employer: 7.85  },
  { min: 500.01,  max: 600,   employee: 2.75,  employer: 9.65  },
  { min: 600.01,  max: 700,   employee: 3.25,  employer: 11.35 },
  { min: 700.01,  max: 800,   employee: 3.75,  employer: 13.15 },
  { min: 800.01,  max: 900,   employee: 4.25,  employer: 14.85 },
  { min: 900.01,  max: 1000,  employee: 4.75,  employer: 16.65 },
  { min: 1000.01, max: 1100,  employee: 5.25,  employer: 18.35 },
  { min: 1100.01, max: 1200,  employee: 5.75,  employer: 20.15 },
  { min: 1200.01, max: 1300,  employee: 6.25,  employer: 21.85 },
  { min: 1300.01, max: 1400,  employee: 6.75,  employer: 23.65 },
  { min: 1400.01, max: 1500,  employee: 7.25,  employer: 25.35 },
  { min: 1500.01, max: 1600,  employee: 7.75,  employer: 27.15 },
  { min: 1600.01, max: 1700,  employee: 8.25,  employer: 28.85 },
  { min: 1700.01, max: 1800,  employee: 8.75,  employer: 30.65 },
  { min: 1800.01, max: 1900,  employee: 9.25,  employer: 32.35 },
  { min: 1900.01, max: 2000,  employee: 9.75,  employer: 34.15 },
  { min: 2000.01, max: 2100,  employee: 10.25, employer: 35.85 },
  { min: 2100.01, max: 2200,  employee: 10.75, employer: 37.65 },
  { min: 2200.01, max: 2300,  employee: 11.25, employer: 39.35 },
  { min: 2300.01, max: 2400,  employee: 11.75, employer: 41.15 },
  { min: 2400.01, max: 2500,  employee: 12.25, employer: 42.85 },
  { min: 2500.01, max: 2600,  employee: 12.75, employer: 44.65 },
  { min: 2600.01, max: 2700,  employee: 13.25, employer: 46.35 },
  { min: 2700.01, max: 2800,  employee: 13.75, employer: 48.15 },
  { min: 2800.01, max: 2900,  employee: 14.25, employer: 49.85 },
  { min: 2900.01, max: 3000,  employee: 14.75, employer: 51.65 },
  { min: 3000.01, max: 3100,  employee: 15.25, employer: 53.35 },
  { min: 3100.01, max: 3200,  employee: 15.75, employer: 55.15 },
  { min: 3200.01, max: 3300,  employee: 16.25, employer: 56.85 },
  { min: 3300.01, max: 3400,  employee: 16.75, employer: 58.65 },
  { min: 3400.01, max: 3500,  employee: 17.25, employer: 60.35 },
  { min: 3500.01, max: 3600,  employee: 17.75, employer: 62.15 },
  { min: 3600.01, max: 3700,  employee: 18.25, employer: 63.85 },
  { min: 3700.01, max: 3800,  employee: 18.75, employer: 65.65 },
  { min: 3800.01, max: 3900,  employee: 19.25, employer: 67.35 },
  { min: 3900.01, max: 4000,  employee: 19.75, employer: 69.15 },
  { min: 4000.01, max: 4100,  employee: 20.25, employer: 70.85 },
  { min: 4100.01, max: 4200,  employee: 20.75, employer: 72.65 },
  { min: 4200.01, max: 4300,  employee: 21.25, employer: 74.35 },
  { min: 4300.01, max: 4400,  employee: 21.75, employer: 76.15 },
  { min: 4400.01, max: 4500,  employee: 22.25, employer: 77.85 },
  { min: 4500.01, max: 4600,  employee: 22.75, employer: 79.65 },
  { min: 4600.01, max: 4700,  employee: 23.25, employer: 81.35 },
  { min: 4700.01, max: 4800,  employee: 23.75, employer: 83.15 },
  { min: 4800.01, max: 4900,  employee: 24.25, employer: 84.85 },
  { min: 4900.01, max: 5000,  employee: 24.75, employer: 86.65 },
  { min: 5000.01, max: 5100,  employee: 25.25, employer: 88.35 },
  { min: 5100.01, max: 5200,  employee: 25.75, employer: 90.15 },
  { min: 5200.01, max: 5300,  employee: 26.25, employer: 91.85 },
  { min: 5300.01, max: 5400,  employee: 26.75, employer: 93.65 },
  { min: 5400.01, max: 5500,  employee: 27.25, employer: 95.35 },
  { min: 5500.01, max: 5600,  employee: 27.75, employer: 97.15 },
  { min: 5600.01, max: 5700,  employee: 28.25, employer: 98.85 },
  { min: 5700.01, max: 5800,  employee: 28.75, employer: 100.65 },
  { min: 5800.01, max: 5900,  employee: 29.25, employer: 102.35 },
  { min: 5900.01, max: 6000,  employee: 29.75, employer: 104.15 }
];

// Maximum SOCSO contribution (for salary > RM6,000)
const SOCSO_MAX = { employee: 29.75, employer: 104.15 };

// ============================================================================
// EIS (SIP) Contribution Table
// Employment Insurance System (employees aged 18-60)
// Effective 1 October 2024 (65-tier, wage ceiling RM6,000)
// ============================================================================
const EIS_TABLE = [
  { min: 0,       max: 30,    employee: 0.05,  employer: 0.05  },
  { min: 30.01,   max: 50,    employee: 0.10,  employer: 0.10  },
  { min: 50.01,   max: 70,    employee: 0.15,  employer: 0.15  },
  { min: 70.01,   max: 100,   employee: 0.20,  employer: 0.20  },
  { min: 100.01,  max: 140,   employee: 0.25,  employer: 0.25  },
  { min: 140.01,  max: 200,   employee: 0.35,  employer: 0.35  },
  { min: 200.01,  max: 300,   employee: 0.50,  employer: 0.50  },
  { min: 300.01,  max: 400,   employee: 0.70,  employer: 0.70  },
  { min: 400.01,  max: 500,   employee: 0.90,  employer: 0.90  },
  { min: 500.01,  max: 600,   employee: 1.10,  employer: 1.10  },
  { min: 600.01,  max: 700,   employee: 1.30,  employer: 1.30  },
  { min: 700.01,  max: 800,   employee: 1.50,  employer: 1.50  },
  { min: 800.01,  max: 900,   employee: 1.70,  employer: 1.70  },
  { min: 900.01,  max: 1000,  employee: 1.90,  employer: 1.90  },
  { min: 1000.01, max: 1100,  employee: 2.10,  employer: 2.10  },
  { min: 1100.01, max: 1200,  employee: 2.30,  employer: 2.30  },
  { min: 1200.01, max: 1300,  employee: 2.50,  employer: 2.50  },
  { min: 1300.01, max: 1400,  employee: 2.70,  employer: 2.70  },
  { min: 1400.01, max: 1500,  employee: 2.90,  employer: 2.90  },
  { min: 1500.01, max: 1600,  employee: 3.10,  employer: 3.10  },
  { min: 1600.01, max: 1700,  employee: 3.30,  employer: 3.30  },
  { min: 1700.01, max: 1800,  employee: 3.50,  employer: 3.50  },
  { min: 1800.01, max: 1900,  employee: 3.70,  employer: 3.70  },
  { min: 1900.01, max: 2000,  employee: 3.90,  employer: 3.90  },
  { min: 2000.01, max: 2100,  employee: 4.10,  employer: 4.10  },
  { min: 2100.01, max: 2200,  employee: 4.30,  employer: 4.30  },
  { min: 2200.01, max: 2300,  employee: 4.50,  employer: 4.50  },
  { min: 2300.01, max: 2400,  employee: 4.70,  employer: 4.70  },
  { min: 2400.01, max: 2500,  employee: 4.90,  employer: 4.90  },
  { min: 2500.01, max: 2600,  employee: 5.10,  employer: 5.10  },
  { min: 2600.01, max: 2700,  employee: 5.30,  employer: 5.30  },
  { min: 2700.01, max: 2800,  employee: 5.50,  employer: 5.50  },
  { min: 2800.01, max: 2900,  employee: 5.70,  employer: 5.70  },
  { min: 2900.01, max: 3000,  employee: 5.90,  employer: 5.90  },
  { min: 3000.01, max: 3100,  employee: 6.10,  employer: 6.10  },
  { min: 3100.01, max: 3200,  employee: 6.30,  employer: 6.30  },
  { min: 3200.01, max: 3300,  employee: 6.50,  employer: 6.50  },
  { min: 3300.01, max: 3400,  employee: 6.70,  employer: 6.70  },
  { min: 3400.01, max: 3500,  employee: 6.90,  employer: 6.90  },
  { min: 3500.01, max: 3600,  employee: 7.10,  employer: 7.10  },
  { min: 3600.01, max: 3700,  employee: 7.30,  employer: 7.30  },
  { min: 3700.01, max: 3800,  employee: 7.50,  employer: 7.50  },
  { min: 3800.01, max: 3900,  employee: 7.70,  employer: 7.70  },
  { min: 3900.01, max: 4000,  employee: 7.90,  employer: 7.90  },
  { min: 4000.01, max: 4100,  employee: 8.10,  employer: 8.10  },
  { min: 4100.01, max: 4200,  employee: 8.30,  employer: 8.30  },
  { min: 4200.01, max: 4300,  employee: 8.50,  employer: 8.50  },
  { min: 4300.01, max: 4400,  employee: 8.70,  employer: 8.70  },
  { min: 4400.01, max: 4500,  employee: 8.90,  employer: 8.90  },
  { min: 4500.01, max: 4600,  employee: 9.10,  employer: 9.10  },
  { min: 4600.01, max: 4700,  employee: 9.30,  employer: 9.30  },
  { min: 4700.01, max: 4800,  employee: 9.50,  employer: 9.50  },
  { min: 4800.01, max: 4900,  employee: 9.70,  employer: 9.70  },
  { min: 4900.01, max: 5000,  employee: 9.90,  employer: 9.90  },
  { min: 5000.01, max: 5100,  employee: 10.10, employer: 10.10 },
  { min: 5100.01, max: 5200,  employee: 10.30, employer: 10.30 },
  { min: 5200.01, max: 5300,  employee: 10.50, employer: 10.50 },
  { min: 5300.01, max: 5400,  employee: 10.70, employer: 10.70 },
  { min: 5400.01, max: 5500,  employee: 10.90, employer: 10.90 },
  { min: 5500.01, max: 5600,  employee: 11.10, employer: 11.10 },
  { min: 5600.01, max: 5700,  employee: 11.30, employer: 11.30 },
  { min: 5700.01, max: 5800,  employee: 11.50, employer: 11.50 },
  { min: 5800.01, max: 5900,  employee: 11.70, employer: 11.70 },
  { min: 5900.01, max: 6000,  employee: 11.90, employer: 11.90 }
];

// Maximum EIS contribution (for salary > RM6,000)
const EIS_MAX = { employee: 11.90, employer: 11.90 };

// ============================================================================
// PCB Tax Brackets (YA 2024/2025/2026)
// Progressive tax rates for resident individuals
// ============================================================================
const TAX_BRACKETS = [
  { min: 0,       max: 5000,     m: 0,       rate: 0,    cumTax: 0      },
  { min: 5001,    max: 20000,    m: 5000,    rate: 1,    cumTax: 0      },
  { min: 20001,   max: 35000,    m: 20000,   rate: 3,    cumTax: 150    },
  { min: 35001,   max: 50000,    m: 35000,   rate: 6,    cumTax: 600    },
  { min: 50001,   max: 70000,    m: 50000,   rate: 11,   cumTax: 1500   },
  { min: 70001,   max: 100000,   m: 70000,   rate: 19,   cumTax: 3700   },
  { min: 100001,  max: 400000,   m: 100000,  rate: 25,   cumTax: 9400   },
  { min: 400001,  max: 600000,   m: 400000,  rate: 26,   cumTax: 84400  },
  { min: 600001,  max: 2000000,  m: 600000,  rate: 28,   cumTax: 136400 },
  { min: 2000001, max: Infinity, m: 2000000, rate: 30,   cumTax: 528400 }
];

// Tax rebates (applicable only when P <= RM35,000)
const TAX_REBATE_INDIVIDUAL = 400;
const TAX_REBATE_SPOUSE = 400; // KB category only

// Relief amounts
const RELIEF_SELF = 9000;          // D - Individual relief
const RELIEF_SPOUSE = 4000;        // S - Spouse relief (KB only)
const RELIEF_DISABLED_SELF = 6000; // DU - Disabled individual
const RELIEF_DISABLED_SPOUSE = 5000; // SU - Disabled spouse (KB only)
const RELIEF_CHILD_NORMAL = 2000;  // Per qualifying child under 18 or in education
const RELIEF_CHILD_HIGHER_ED = 8000; // Per child in higher education (diploma/degree)
const RELIEF_DISABLED_CHILD = 6000;  // Per disabled child
const EPF_RELIEF_CAP = 4000;      // Maximum EPF relief for PCB calculation

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Round to 2 decimal places
 */
const roundTo2 = (value) => Math.round(value * 100) / 100;

/**
 * PCB rounding: truncate to 2 decimals, then round UP to nearest 5 sen
 */
const roundPCB = (value) => {
  if (value <= 0) return 0;
  // Truncate to 2 decimal places
  const truncated = Math.floor(value * 100) / 100;
  // Round up to nearest 5 sen (0.05)
  const remainder = truncated % 0.05;
  if (remainder === 0) return truncated;
  return roundTo2(truncated + (0.05 - remainder));
};

/**
 * Look up contribution from a wage-band table
 */
const lookupTable = (table, maxContrib, salary) => {
  if (salary <= 0) return { employee: 0, employer: 0 };

  // If salary exceeds the table, return maximum
  const lastBand = table[table.length - 1];
  if (salary > lastBand.max) {
    return { employee: maxContrib.employee, employer: maxContrib.employer };
  }

  const band = table.find(b => salary >= b.min && salary <= b.max);
  if (band) {
    return { employee: band.employee, employer: band.employer };
  }

  return { employee: 0, employer: 0 };
};

/**
 * Get tax bracket for given chargeable income
 */
const getTaxBracket = (chargeableIncome) => {
  for (const bracket of TAX_BRACKETS) {
    if (chargeableIncome <= bracket.max) {
      return bracket;
    }
  }
  return TAX_BRACKETS[TAX_BRACKETS.length - 1];
};

/**
 * Get B value (cumulative tax on M after rebates)
 * For P <= RM35,000: B = cumTax - rebate (min 0)
 * For P > RM35,000: B = cumTax (no rebate)
 */
const getBValue = (chargeableIncome, taxCategory, cumTax) => {
  if (chargeableIncome <= 35000) {
    let rebate = TAX_REBATE_INDIVIDUAL;
    if (taxCategory === 'KB') {
      rebate += TAX_REBATE_SPOUSE;
    }
    return Math.max(cumTax - rebate, 0);
  }
  return cumTax;
};

// ============================================================================
// Get company-specific statutory rates from DB
// ============================================================================
const getCompanyRates = async (companyId) => {
  const defaults = {
    epf_employee_rate: 0.11,
    epf_employer_rate_below_5000: 0.13,
    epf_employer_rate_above_5000: 0.12,
    epf_employer_threshold: 5000,
    socso_max_salary: 6000,
    eis_max_salary: 6000
  };

  if (!companyId) return defaults;

  try {
    const { StatutoryConfig } = require('../models');
    const configs = await StatutoryConfig.findAll({ where: { company_id: companyId } });
    const rates = { ...defaults };
    for (const config of configs) {
      if (rates[config.config_key] !== undefined) {
        rates[config.config_key] = parseFloat(config.config_value);
      }
    }
    return rates;
  } catch {
    return defaults;
  }
};

// ============================================================================
// EPF Calculation
// ============================================================================

/**
 * Calculate EPF (Employees Provident Fund) contributions
 * Employee: 11% of monthly wages (configurable)
 * Employer: 13% if salary <= RM5,000, 12% if > RM5,000 (configurable)
 */
const calculateEPF = (monthlySalary, rateOverrides) => {
  if (monthlySalary <= 0) return { employee: 0, employer: 0 };

  const employeeRate = rateOverrides?.epf_employee_rate ?? 0.11;
  const threshold = rateOverrides?.epf_employer_threshold ?? 5000;
  const employerRate = monthlySalary <= threshold
    ? (rateOverrides?.epf_employer_rate_below_5000 ?? 0.13)
    : (rateOverrides?.epf_employer_rate_above_5000 ?? 0.12);

  return {
    employee: roundTo2(monthlySalary * employeeRate),
    employer: roundTo2(monthlySalary * employerRate)
  };
};

// ============================================================================
// SOCSO Calculation
// ============================================================================

/**
 * Calculate SOCSO (Social Security Organization) contributions
 * Uses official Category 1 wage-band table (65 tiers)
 * Wage ceiling: RM6,000 (effective Oct 2024)
 */
const calculateSOCSO = (monthlySalary) => {
  return lookupTable(SOCSO_TABLE, SOCSO_MAX, monthlySalary);
};

// ============================================================================
// EIS Calculation
// ============================================================================

/**
 * Calculate EIS (Employment Insurance System) contributions
 * Uses official wage-band table (65 tiers)
 * Wage ceiling: RM6,000 (effective Oct 2024)
 */
const calculateEIS = (monthlySalary) => {
  return lookupTable(EIS_TABLE, EIS_MAX, monthlySalary);
};

// ============================================================================
// PCB Calculation (Full LHDN Computerised Algorithm)
// ============================================================================

/**
 * Calculate PCB (Monthly Tax Deduction) using full LHDN e-CP39 algorithm
 *
 * @param {Object} params
 * @param {number} params.monthlySalary - Y1: Current month gross remuneration
 * @param {number} params.currentMonth - 1-12 (January = 1)
 * @param {string} params.taxCategory - 'KA' (single), 'KB' (married, spouse not working), 'KC' (married, spouse working)
 * @param {number} params.numberOfChildren - Qualifying children (under 18 or in education)
 * @param {number} params.childrenInHigherEd - Children in higher education (diploma/degree)
 * @param {number} params.disabledChildren - Number of disabled children
 * @param {boolean} params.disabledSelf - Whether employee is disabled
 * @param {boolean} params.disabledSpouse - Whether spouse is disabled (KB only)
 * @param {number} params.ytdGross - Y: Accumulated gross from previous months
 * @param {number} params.ytdEpf - K: Accumulated EPF from previous months
 * @param {number} params.ytdPcbDeducted - X: Accumulated PCB already deducted
 * @param {number} params.ytdZakat - Z: Accumulated zakat paid
 * @param {number} params.currentMonthEpf - K1: Current month EPF contribution
 * @param {number} params.additionalRemuneration - Yt: Bonus, arrears, etc. (optional)
 * @param {number} params.additionalRemunerationEpf - Kt: EPF on additional remuneration (optional)
 * @param {boolean} params.isResident - Whether employee is a tax resident (default: true)
 * @returns {number} Monthly PCB amount
 */
const calculatePCB = (params) => {
  const {
    monthlySalary = 0,
    currentMonth = 1,
    taxCategory = 'KA',
    numberOfChildren = 0,
    childrenInHigherEd = 0,
    disabledChildren = 0,
    disabledSelf = false,
    disabledSpouse = false,
    ytdGross = 0,
    ytdEpf = 0,
    ytdPcbDeducted = 0,
    ytdZakat = 0,
    currentMonthEpf = 0,
    additionalRemuneration = 0,
    additionalRemunerationEpf = 0,
    isResident = true
  } = params;

  if (monthlySalary <= 0) return 0;

  // Non-resident: flat 30% rate
  if (!isResident) {
    return roundTo2(monthlySalary * 0.30);
  }

  // n = remaining months after current month
  const n = 12 - currentMonth;

  // Step 1: Project annual gross income
  // Y (previous) + Y1 (current) + Y2 * n (projected remaining)
  // Y2 is assumed equal to Y1 (current month salary projected for remaining months)
  const totalGross = ytdGross + monthlySalary + (monthlySalary * n);

  // Step 2: Project annual EPF
  // K (previous) + K1 (current) + K2 * n (projected)
  // K2 is assumed equal to K1
  const totalEpfRaw = ytdEpf + currentMonthEpf + (currentMonthEpf * n);
  const effectiveEpf = Math.min(totalEpfRaw, EPF_RELIEF_CAP);

  // Step 3: Calculate net income after EPF
  const netIncome = totalGross - effectiveEpf;

  // Step 4: Calculate total reliefs/deductions
  let totalDeductions = RELIEF_SELF; // D = RM9,000

  // Spouse relief (KB only)
  if (taxCategory === 'KB') {
    totalDeductions += RELIEF_SPOUSE; // S = RM4,000
  }

  // Disabled self relief
  if (disabledSelf) {
    totalDeductions += RELIEF_DISABLED_SELF; // DU = RM6,000
  }

  // Disabled spouse relief (KB only)
  if (taxCategory === 'KB' && disabledSpouse) {
    totalDeductions += RELIEF_DISABLED_SPOUSE; // SU = RM5,000
  }

  // Child relief
  // Normal children get RM2,000 each
  // Children in higher education get RM8,000 each (instead of RM2,000)
  // Disabled children get RM6,000 each (additional)
  const normalChildren = Math.max(numberOfChildren - childrenInHigherEd - disabledChildren, 0);
  const childRelief =
    (normalChildren * RELIEF_CHILD_NORMAL) +
    (childrenInHigherEd * RELIEF_CHILD_HIGHER_ED) +
    (disabledChildren * RELIEF_DISABLED_CHILD);
  totalDeductions += childRelief;

  // Step 5: Calculate chargeable income (P)
  const P = Math.max(netIncome - totalDeductions, 0);

  if (P <= 0) return 0;

  // Step 6: Look up tax bracket
  const bracket = getTaxBracket(P);

  // Step 7: Get B value (cumulative tax on M after rebates)
  const B = getBValue(P, taxCategory, bracket.cumTax);

  // Step 8: Calculate annual tax on normal remuneration
  let T_normal = ((P - bracket.m) * bracket.rate / 100) + B;
  T_normal = Math.max(T_normal, 0);

  // Step 9: Calculate monthly PCB
  // PCB = (T - Z - X) / (n + 1)
  let pcbNormal = (T_normal - ytdZakat - ytdPcbDeducted) / (n + 1);
  pcbNormal = Math.max(pcbNormal, 0);

  // Step 10: Handle additional remuneration (bonus, arrears, etc.)
  let pcbAdditional = 0;
  if (additionalRemuneration > 0) {
    // Recalculate P including additional remuneration
    const totalGrossWithAdditional = totalGross + additionalRemuneration;
    const totalEpfWithAdditional = Math.min(
      totalEpfRaw + additionalRemunerationEpf,
      EPF_RELIEF_CAP
    );
    const netIncomeWithAdditional = totalGrossWithAdditional - totalEpfWithAdditional;
    const P_withAdditional = Math.max(netIncomeWithAdditional - totalDeductions, 0);

    if (P_withAdditional > 0) {
      const bracketAdditional = getTaxBracket(P_withAdditional);
      const B_additional = getBValue(P_withAdditional, taxCategory, bracketAdditional.cumTax);
      let T_withAdditional = ((P_withAdditional - bracketAdditional.m) * bracketAdditional.rate / 100) + B_additional;
      T_withAdditional = Math.max(T_withAdditional, 0);
      pcbAdditional = Math.max(T_withAdditional - T_normal, 0);
    }
  }

  // Step 11: Total PCB
  let totalPCB = pcbNormal + pcbAdditional;

  // Step 12: Apply minimum threshold (< RM10 = 0)
  if (totalPCB < 10) {
    totalPCB = 0;
  }

  // Step 13: Apply PCB rounding (truncate to 2dp, round up to nearest 5 sen)
  return roundPCB(totalPCB);
};

// ============================================================================
// Combined Statutory Calculation
// ============================================================================

/**
 * Calculate all statutory deductions
 *
 * @param {number} monthlySalary - Gross monthly salary
 * @param {Object} options
 * @param {boolean} options.hasEPF - Include EPF (default: true)
 * @param {boolean} options.hasSOCSO - Include SOCSO (default: true)
 * @param {boolean} options.hasEIS - Include EIS (default: true)
 * @param {boolean} options.hasPCB - Include PCB (default: true)
 * @param {Object} options.rateOverrides - Company-specific rate overrides
 * @param {Object} options.employee - Employee details for PCB
 * @param {string} options.employee.tax_category - KA/KB/KC
 * @param {number} options.employee.number_of_children
 * @param {number} options.employee.children_in_higher_education
 * @param {number} options.employee.disabled_children
 * @param {boolean} options.employee.disabled_self
 * @param {boolean} options.employee.disabled_spouse
 * @param {Object} options.ytd - YTD data for PCB
 * @param {number} options.ytd.gross - YTD gross salary (previous months)
 * @param {number} options.ytd.epf - YTD EPF contributions (previous months)
 * @param {number} options.ytd.pcbDeducted - YTD PCB already deducted
 * @param {number} options.ytd.zakat - YTD zakat paid
 * @param {number} options.currentMonth - Current month (1-12)
 * @param {number} options.additionalRemuneration - Bonus/arrears for current month
 * @returns {Object} Complete statutory breakdown
 */
const calculateAllStatutory = (monthlySalary, options = {}) => {
  const {
    hasEPF = true,
    hasSOCSO = true,
    hasEIS = true,
    hasPCB = true,
    rateOverrides,
    employee = {},
    ytd = {},
    currentMonth = new Date().getMonth() + 1,
    additionalRemuneration = 0
  } = options;

  const epf = hasEPF ? calculateEPF(monthlySalary, rateOverrides) : { employee: 0, employer: 0 };
  const socso = hasSOCSO ? calculateSOCSO(monthlySalary) : { employee: 0, employer: 0 };
  const eis = hasEIS ? calculateEIS(monthlySalary) : { employee: 0, employer: 0 };

  let pcb = 0;
  if (hasPCB) {
    const currentMonthEpf = epf.employee;
    const additionalRemunerationEpf = hasEPF && additionalRemuneration > 0
      ? roundTo2(additionalRemuneration * (rateOverrides?.epf_employee_rate ?? 0.11))
      : 0;

    pcb = calculatePCB({
      monthlySalary,
      currentMonth,
      taxCategory: employee.tax_category || 'KA',
      numberOfChildren: employee.number_of_children || 0,
      childrenInHigherEd: employee.children_in_higher_education || 0,
      disabledChildren: employee.disabled_children || 0,
      disabledSelf: employee.disabled_self || false,
      disabledSpouse: employee.disabled_spouse || false,
      ytdGross: ytd.gross || 0,
      ytdEpf: ytd.epf || 0,
      ytdPcbDeducted: ytd.pcbDeducted || 0,
      ytdZakat: ytd.zakat || 0,
      currentMonthEpf,
      additionalRemuneration,
      additionalRemunerationEpf,
      isResident: true
    });
  }

  const totalEmployeeDeduction = roundTo2(epf.employee + socso.employee + eis.employee + pcb);
  const totalEmployerContribution = roundTo2(epf.employer + socso.employer + eis.employer);

  return {
    epf,
    socso,
    eis,
    pcb,
    totalEmployeeDeduction,
    totalEmployerContribution
  };
};

module.exports = {
  calculateEPF,
  calculateSOCSO,
  calculateEIS,
  calculatePCB,
  calculateAllStatutory,
  getCompanyRates,
  // Export tables for testing/reference
  SOCSO_TABLE,
  EIS_TABLE,
  TAX_BRACKETS
};
