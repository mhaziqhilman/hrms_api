/**
 * Overtime Service
 *
 * Single source of truth for OT rate maths and the payroll bridge.
 * Used by overtimeController (compute amount on submit/edit, day-type/attendance
 * suggestions) and payrollController (auto-sum approved OT into overtime_pay).
 *
 * Malaysian Employment Act 1955 reference:
 *   Ordinary Rate of Pay (ORP) = monthly wage / 26
 *   Hourly Rate of Pay  (HRP)  = ORP / normal working hours per day (8)
 *   OT payable = hours * multiplier * HRP
 *   multiplier = 1.5 (normal working day) | 2.0 (rest day) | 3.0 (public holiday)
 */

const { Op } = require('sequelize');
const Overtime = require('../models/Overtime');
const PublicHoliday = require('../models/PublicHoliday');
const Attendance = require('../models/Attendance');
const logger = require('../utils/logger');

// EA divisors and multipliers (constants — could later move to statutory_config)
const WORKING_DAYS_PER_MONTH = 26;
const NORMAL_HOURS_PER_DAY = 8;

const EA_MULTIPLIERS = {
  normal: 1.5,
  rest_day: 2.0,
  public_holiday: 3.0
};

// Weekend days treated as rest days (0 = Sunday, 6 = Saturday)
const REST_DAYS = [0, 6];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Hourly rate of pay from monthly basic salary. */
function hourlyRate(basicSalary) {
  const basic = parseFloat(basicSalary) || 0;
  return round2(basic / WORKING_DAYS_PER_MONTH / NORMAL_HOURS_PER_DAY);
}

/** Multiplier for a given day type (defaults to normal). */
function multiplierFor(dayType) {
  return EA_MULTIPLIERS[dayType] ?? EA_MULTIPLIERS.normal;
}

/**
 * Compute the OT payout and the snapshot values stored on the record.
 * @returns {{ hourly_rate:number, multiplier:number, amount:number }}
 */
function computeAmount(basicSalary, hours, dayType) {
  const hr = hourlyRate(basicSalary);
  const mult = multiplierFor(dayType);
  const amount = round2((parseFloat(hours) || 0) * mult * hr);
  return { hourly_rate: hr, multiplier: mult, amount };
}

/**
 * Determine the day type for a date within a company:
 *   public holiday (matches public_holidays) > rest day (weekend) > normal.
 */
async function detectDayType(companyId, date) {
  try {
    const holiday = await PublicHoliday.findOne({
      where: { company_id: companyId, date }
    });
    if (holiday) return 'public_holiday';
  } catch (err) {
    logger.warn(`detectDayType holiday lookup failed: ${err.message}`);
  }

  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (REST_DAYS.includes(dow)) return 'rest_day';
  return 'normal';
}

/**
 * Suggest OT hours from a day's attendance: hours worked beyond the normal 8.
 * Returns 0 when there is no attendance record or the day was <= 8 hours.
 */
async function suggestHoursFromAttendance(employeeId, date) {
  try {
    const record = await Attendance.findOne({
      where: { employee_id: employeeId, date },
      attributes: ['id', 'total_hours']
    });
    if (!record || record.total_hours == null) {
      return { attendance_id: null, total_hours: null, suggested_hours: 0 };
    }
    const total = parseFloat(record.total_hours) || 0;
    return {
      attendance_id: record.id,
      total_hours: total,
      suggested_hours: round2(Math.max(0, total - NORMAL_HOURS_PER_DAY))
    };
  } catch (err) {
    logger.warn(`suggestHoursFromAttendance failed: ${err.message}`);
    return { attendance_id: null, total_hours: null, suggested_hours: 0 };
  }
}

/**
 * Approved, not-yet-consumed OT records for an employee + payroll period.
 * @param {object} [opts]
 * @param {import('sequelize').Transaction} [opts.transaction]
 */
async function getApprovedOTRecords(employeeId, year, month, opts = {}) {
  const where = {
    employee_id: employeeId,
    period_year: year,
    period_month: month,
    status: 'Approved',
    payroll_id: { [Op.is]: null }
  };
  return Overtime.findAll({
    where,
    attributes: ['id', 'amount'],
    transaction: opts.transaction
  });
}

/**
 * Sum of approved, unconsumed OT amounts for an employee + period.
 * Convenience for previews and the frontend "approved total" endpoint.
 */
async function getApprovedOTTotal(employeeId, year, month, opts = {}) {
  const records = await getApprovedOTRecords(employeeId, year, month, opts);
  return round2(records.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0));
}

/**
 * Mark OT records as consumed by a generated payroll (prevents double-counting).
 */
async function markConsumed(otIds, payrollId, transaction) {
  if (!otIds || otIds.length === 0) return;
  await Overtime.update(
    { payroll_id: payrollId },
    { where: { id: { [Op.in]: otIds } }, transaction }
  );
}

module.exports = {
  WORKING_DAYS_PER_MONTH,
  NORMAL_HOURS_PER_DAY,
  EA_MULTIPLIERS,
  hourlyRate,
  multiplierFor,
  computeAmount,
  detectDayType,
  suggestHoursFromAttendance,
  getApprovedOTRecords,
  getApprovedOTTotal,
  markConsumed
};
