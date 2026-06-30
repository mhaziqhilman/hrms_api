/**
 * subscriptionJobs — periodic maintenance for the subscription system.
 *
 * Dependency-free scheduler (no node-cron): runs once shortly after boot,
 * then every 24h. Today it's effectively a no-op (everyone is on Basic with
 * no trials/periods), but it's wired so trials and billing periods expire
 * correctly once Pro/Enterprise launch.
 */

const subscriptionService = require('../services/subscriptionService');
const logger = require('../utils/logger');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let timer = null;

const runMaintenance = async () => {
  try {
    await subscriptionService.expireTrials();
  } catch (error) {
    logger.error(`Subscription maintenance job failed: ${error.message}`);
  }
};

/**
 * Start the daily maintenance loop. Call once from server startup.
 * First run is delayed 60s to avoid contending with boot-time work.
 */
const startSubscriptionJobs = () => {
  if (timer) return; // idempotent

  setTimeout(runMaintenance, 60 * 1000);
  timer = setInterval(runMaintenance, ONE_DAY_MS);
  // Don't keep the event loop alive solely for this timer.
  if (timer.unref) timer.unref();

  logger.info('Subscription maintenance job scheduled (daily).');
};

const stopSubscriptionJobs = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

module.exports = { startSubscriptionJobs, stopSubscriptionJobs, runMaintenance };
