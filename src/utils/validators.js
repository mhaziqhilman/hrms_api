/**
 * Custom validators for Malaysian-specific data
 */

/**
 * Validate Malaysian IC number (MyKad)
 * Format: YYMMDD-PB-###G
 * @param {String} ic - IC number
 */
const isValidMyKad = (ic) => {
  if (!ic) return false;

  // Remove hyphens and spaces
  const cleanIC = ic.replace(/[-\s]/g, '');

  // Must be 12 digits
  if (!/^\d{12}$/.test(cleanIC)) {
    return false;
  }

  // Validate date part (first 6 digits)
  const year = parseInt(cleanIC.substring(0, 2));
  const month = parseInt(cleanIC.substring(2, 4));
  const day = parseInt(cleanIC.substring(4, 6));

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Validate state code (digits 7-8)
  const stateCode = parseInt(cleanIC.substring(6, 8));
  const validStateCodes = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    21, 22, 23, 24, 25, 26, 27, 28, 29,
    30, 31, 32, 33,
    40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
    50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
    60, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
    80, 81, 82, 83
  ];

  return validStateCodes.includes(stateCode);
};

/**
 * Validate Malaysian mobile number
 * Format: 01X-XXXXXXX or 01X-XXXXXXXX
 * @param {String} mobile - Mobile number
 */
const isValidMalaysianMobile = (mobile) => {
  if (!mobile) return false;

  const cleanMobile = mobile.replace(/[-\s]/g, '');

  // Must start with 01 and be 10-11 digits
  return /^01[0-9]{8,9}$/.test(cleanMobile);
};

/**
 * Validate email format
 * @param {String} email - Email address
 */
const isValidEmail = (email) => {
  if (!email) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate EPF number format
 * @param {String} epf - EPF number
 */
const isValidEPFNumber = (epf) => {
  if (!epf) return false;

  // EPF number is typically 8-12 digits
  return /^\d{8,12}$/.test(epf.replace(/[-\s]/g, ''));
};

/**
 * Validate SOCSO number format
 * @param {String} socso - SOCSO number
 */
const isValidSOCSONumber = (socso) => {
  if (!socso) return false;

  // SOCSO number is typically 10-12 digits
  return /^\d{10,12}$/.test(socso.replace(/[-\s]/g, ''));
};

/**
 * Validate Malaysian Tax number (Income Tax Number)
 * Format: SG followed by 10 digits or IG followed by 10 digits
 * @param {String} taxNumber - Tax number
 */
const isValidTaxNumber = (taxNumber) => {
  if (!taxNumber) return false;

  const cleanTaxNumber = taxNumber.replace(/[-\s]/g, '').toUpperCase();

  // SG for individuals, IG for companies
  return /^(SG|IG)\d{10}$/.test(cleanTaxNumber);
};

/**
 * Validate password strength
 * @param {String} password - Password
 */
const isStrongPassword = (password) => {
  if (!password || password.length < 8) return false;

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  return hasUpperCase && hasLowerCase && hasNumber;
};

/**
 * Validate salary amount (must be positive and reasonable)
 * @param {Number} salary - Salary amount
 */
const isValidSalary = (salary) => {
  if (!salary || salary < 0) return false;

  // Minimum wage in Malaysia (as of 2024) is RM1,500
  // Maximum reasonable salary cap for validation: RM100,000
  return salary >= 1500 && salary <= 100000;
};

module.exports = {
  isValidMyKad,
  isValidMalaysianMobile,
  isValidEmail,
  isValidEPFNumber,
  isValidSOCSONumber,
  isValidTaxNumber,
  isStrongPassword,
  isValidSalary
};
