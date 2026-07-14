/**
 * attendanceAutoCloseService — closes attendance sessions where the employee
 * forgot to clock out.
 *
 * Policy: once the cross-day clock-out window has passed (07:00 the next day),
 * an open session can no longer be closed manually. Instead of leaving a
 * dangling record with a null clock_out_time (and no total_hours), we
 * auto-record the clock-out at office end (6:00 PM) on the clock-in date,
 * compute total_hours from that, and flag the record via `remarks` so an
 * admin/manager can adjust it if needed.
 *
 * Malaysia (Asia/Kuala_Lumpur) has a fixed UTC+8 offset with no DST, so we can
 * build exact instants from the DATEONLY `date` using a literal "+08:00".
 */

const { Op } = require('sequelize');
const { Attendance, Employee } = require('../models');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const APP_TIMEZONE = 'Asia/Kuala_Lumpur';
const OFFICE_END_HOUR = 18; // 6:00 PM — the clock-out time we record
const CUTOFF_HOUR = 7;      // 7:00 AM next day — after this, the window is closed
const HOUR_MS = 60 * 60 * 1000;

/** Current date string (YYYY-MM-DD) in the app timezone. */
function getTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
}

/** Epoch ms of 00:00 (local MYT) on the given YYYY-MM-DD date. */
function dayStartMs(dateStr) {
  return new Date(`${dateStr}T00:00:00+08:00`).getTime();
}

/** True once we're past 07:00 the day after `dateStr` (the clock-out window). */
function isPastCutoff(dateStr, nowMs = Date.now()) {
  return nowMs >= dayStartMs(dateStr) + (24 + CUTOFF_HOUR) * HOUR_MS;
}

/**
 * Close a single open attendance record at office end (6:00 PM) of its date.
 * Guards against evening clock-ins (where 6 PM precedes clock-in) by clamping
 * the clock-out to the clock-in time (0 hours) rather than recording negative.
 */
async function closeRecord(attendance) {
  const clockInMs = new Date(attendance.clock_in_time).getTime();
  let closeMs = dayStartMs(attendance.date) + OFFICE_END_HOUR * HOUR_MS;
  if (closeMs <= clockInMs) closeMs = clockInMs; // evening/overnight clock-in guard

  const clockOutTime = new Date(closeMs);
  const totalHours = ((closeMs - clockInMs) / HOUR_MS).toFixed(2);
  const note = 'Auto clock-out — missed clock-out (recorded at 6:00 PM)';

  await attendance.update({
    clock_out_time: clockOutTime,
    total_hours: totalHours,
    remarks: attendance.remarks ? `${attendance.remarks}\n${note}` : note
  });

  return attendance;
}

/** Notify the employee (fire-and-forget) that we auto-recorded their clock-out. */
async function notifyEmployee(userId, companyId, attendance) {
  if (!userId) return;
  try {
    await notificationService.createNotification(
      userId,
      companyId,
      'attendance_auto_clocked_out',
      'Attendance auto-recorded',
      `You didn't clock out on ${attendance.date}, so we recorded your clock-out at 6:00 PM. Contact your manager if this needs adjusting.`,
      { attendance_id: attendance.public_id, date: attendance.date }
    );
  } catch (err) {
    logger.warn(`Auto clock-out notify failed: ${err.message}`);
  }
}

/**
 * Lazy fallback: close any of this employee's stale open sessions (used on the
 * next clock-in). Only touches records before today whose window has passed, so
 * a legitimate before-7 AM cross-day clock-out is never pre-empted.
 */
async function closeStaleForEmployee(employeeId) {
  const nowMs = Date.now();
  const open = await Attendance.findAll({
    where: {
      employee_id: employeeId,
      clock_out_time: null,
      clock_in_time: { [Op.ne]: null },
      date: { [Op.lt]: getTodayDate() }
    }
  });

  let closed = 0;
  for (const att of open) {
    if (!isPastCutoff(att.date, nowMs)) continue;
    await closeRecord(att);
    closed++;
  }
  return closed;
}

/**
 * Scheduled sweep: close every stale open session across all companies whose
 * clock-out window has passed. Safe to run repeatedly (idempotent — already
 * closed records have a non-null clock_out_time and are excluded).
 */
async function sweepStaleSessions() {
  const nowMs = Date.now();
  const open = await Attendance.findAll({
    where: {
      clock_out_time: null,
      clock_in_time: { [Op.ne]: null },
      date: { [Op.lt]: getTodayDate() }
    },
    include: [{ model: Employee, as: 'employee', attributes: ['id', 'user_id', 'company_id'] }]
  });

  let closed = 0;
  for (const att of open) {
    if (!isPastCutoff(att.date, nowMs)) continue;
    await closeRecord(att);
    closed++;
    if (att.employee) {
      await notifyEmployee(att.employee.user_id, att.employee.company_id, att);
    }
  }

  if (closed > 0) {
    logger.info(`Attendance auto clock-out sweep: closed ${closed} stale session(s).`);
  }
  return closed;
}

module.exports = {
  closeRecord,
  closeStaleForEmployee,
  sweepStaleSessions,
  isPastCutoff,
  OFFICE_END_HOUR,
  CUTOFF_HOUR
};
