const { format, parseISO, differenceInDays, differenceInYears } = require('date-fns');

/**
 * Format date to Malaysian standard (DD/MM/YYYY)
 * @param {Date|String} date - Date to format
 * @returns {String} Formatted date
 */
const formatDateMY = (date) => {
  if (!date) return '';
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'dd/MM/yyyy');
};

/**
 * Format currency to MYR
 * @param {Number} amount - Amount to format
 * @returns {String} Formatted currency
 */
const formatCurrencyMYR = (amount) => {
  if (amount === null || amount === undefined) return 'RM 0.00';
  return `RM ${parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

/**
 * Calculate working days between two dates (excluding weekends)
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Number} Number of working days
 */
const calculateWorkingDays = (startDate, endDate) => {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Exclude Saturday (6) and Sunday (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
};

/**
 * Calculate age from date of birth
 * @param {Date|String} dob - Date of birth
 * @returns {Number} Age in years
 */
const calculateAge = (dob) => {
  if (!dob) return 0;
  const birthDate = typeof dob === 'string' ? parseISO(dob) : dob;
  return differenceInYears(new Date(), birthDate);
};

/**
 * Calculate service years
 * @param {Date|String} joinDate - Join date
 * @returns {Number} Years of service
 */
const calculateServiceYears = (joinDate) => {
  if (!joinDate) return 0;
  const join = typeof joinDate === 'string' ? parseISO(joinDate) : joinDate;
  return differenceInYears(new Date(), join);
};

/**
 * Generate random string (for tokens, etc.)
 * @param {Number} length - Length of string
 * @returns {String} Random string
 */
const generateRandomString = (length = 32) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Calculate proration for partial month
 * @param {Number} fullAmount - Full month amount
 * @param {Number} workedDays - Days worked
 * @param {Number} totalDays - Total days in month
 * @returns {Number} Prorated amount
 */
const calculateProration = (fullAmount, workedDays, totalDays) => {
  if (workedDays >= totalDays) return fullAmount;
  return (fullAmount / totalDays) * workedDays;
};

/**
 * Round to 2 decimal places
 * @param {Number} value - Value to round
 * @returns {Number} Rounded value
 */
const roundToTwo = (value) => {
  return Math.round(value * 100) / 100;
};

/**
 * Sanitize filename for safe storage
 * @param {String} filename - Original filename
 * @returns {String} Sanitized filename
 */
const sanitizeFilename = (filename) => {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};

/**
 * Generate employee ID
 * @param {String} prefix - Company prefix
 * @param {Number} sequence - Sequence number
 * @returns {String} Employee ID
 */
const generateEmployeeId = (prefix = 'EMP', sequence) => {
  return `${prefix}${String(sequence).padStart(5, '0')}`;
};

/**
 * Check if date is weekend
 * @param {Date} date - Date to check
 * @returns {Boolean} True if weekend
 */
const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

/**
 * Get current Malaysian time (GMT+8)
 * @returns {Date} Current Malaysian time
 */
const getMalaysianTime = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 8));
};

module.exports = {
  formatDateMY,
  formatCurrencyMYR,
  calculateWorkingDays,
  calculateAge,
  calculateServiceYears,
  generateRandomString,
  calculateProration,
  roundToTwo,
  sanitizeFilename,
  generateEmployeeId,
  isWeekend,
  getMalaysianTime
};
