/**
 * attendanceJobs — periodic auto clock-out for forgotten sessions.
 *
 * Dependency-free scheduler (no node-cron): runs once shortly after boot, then
 * hourly. Each run closes any attendance record left open past the clock-out
 * window (07:00 the next day), recording the clock-out at office end (6:00 PM)
 * so payroll gets sensible hours instead of a dangling null. Running hourly
 * (rather than once at 07:00) makes it resilient to restarts — a missed run is
 * picked up within the hour, and the sweep is idempotent.
 */

const attendanceAutoClose = require('../services/attendanceAutoCloseService');
const logger = require('../utils/logger');

const ONE_HOUR_MS = 60 * 60 * 1000;

let timer = null;

const runSweep = async () => {
  try {
    await attendanceAutoClose.sweepStaleSessions();
  } catch (error) {
    logger.error(`Attendance auto clock-out job failed: ${error.message}`);
  }
};

/**
 * Start the hourly auto clock-out loop. Call once from server startup.
 * First run is delayed 90s to avoid contending with boot-time work.
 */
const startAttendanceJobs = () => {
  if (timer) return; // idempotent

  setTimeout(runSweep, 90 * 1000);
  timer = setInterval(runSweep, ONE_HOUR_MS);
  // Don't keep the event loop alive solely for this timer.
  if (timer.unref) timer.unref();

  logger.info('Attendance auto clock-out job scheduled (hourly).');
};

const stopAttendanceJobs = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

module.exports = { startAttendanceJobs, stopAttendanceJobs, runSweep };
