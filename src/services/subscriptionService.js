/**
 * subscriptionService — core logic for the per-user package/tier system.
 *
 * Design notes for the current "Basic-open" phase:
 *   - Every user has exactly one Subscription row (created on signup / backfill).
 *   - Basic grants all features + unlimited limits, so feature/limit checks are
 *     effectively no-ops today, but the plumbing is complete.
 *   - Professional / Enterprise carry is_available = false ("Coming Soon").
 *     subscribe()/changePlan() refuse to put a user on an unavailable package
 *     UNLESS opts.adminOverride is set (Super Admin manual assignment).
 *
 * Enforcement is gated by PACKAGE_ENFORCEMENT in packageMiddleware — this
 * service stays pure (it always reports the real feature/limit state).
 */

const { Op } = require('sequelize');
const { sequelize, Subscription, Package, SubscriptionHistory } = require('../models');
const logger = require('../utils/logger');

const DEFAULT_PACKAGE_SLUG = process.env.DEFAULT_PACKAGE_SLUG || 'basic';

/** Error with a machine-readable code, surfaced to controllers/HTTP. */
class SubscriptionError extends Error {
  constructor(message, code, status = 400, extra = {}) {
    super(message);
    this.name = 'SubscriptionError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const getPackageBySlug = async (slug, { transaction } = {}) => {
  const pkg = await Package.findOne({ where: { slug, is_active: true }, transaction });
  if (!pkg) {
    throw new SubscriptionError(`Package "${slug}" not found`, 'PACKAGE_NOT_FOUND', 404);
  }
  return pkg;
};

/** Returns the user's active subscription with its package eager-loaded (or null). */
const getActiveSubscription = async (userId, { transaction } = {}) => {
  return Subscription.findOne({
    where: { user_id: userId },
    include: [{ model: Package, as: 'package' }],
    transaction
  });
};

const getUserFeatures = async (userId) => {
  const sub = await getActiveSubscription(userId);
  return (sub && sub.package && sub.package.features) || {};
};

const getUserLimits = async (userId) => {
  const sub = await getActiveSubscription(userId);
  return (sub && sub.package && sub.package.limits) || {};
};

/** Boolean feature check (pure — enforcement flag is handled by middleware). */
const hasFeature = async (userId, featureKey) => {
  const features = await getUserFeatures(userId);
  return features[featureKey] === true;
};

/**
 * Check a usage limit. -1 (or missing) = unlimited.
 * Returns { allowed, limit, current }.
 */
const checkLimit = async (userId, limitKey, currentValue) => {
  const limits = await getUserLimits(userId);
  const limit = limits[limitKey];
  if (limit === undefined || limit === null || limit === -1) {
    return { allowed: true, limit: -1, current: currentValue };
  }
  return { allowed: currentValue < limit, limit, current: currentValue };
};

/** Write an append-only history row. */
const recordHistory = async (
  { userId, fromPackageId, toPackageId, action, changedBy, reason, metadata },
  { transaction } = {}
) => {
  return SubscriptionHistory.create(
    {
      user_id: userId,
      from_package_id: fromPackageId || null,
      to_package_id: toPackageId,
      action,
      changed_by: changedBy || null,
      reason: reason || null,
      metadata: metadata || {}
    },
    { transaction }
  );
};

/**
 * Create or replace a user's subscription, targeting a package slug.
 * Used on signup (basic), self-service change, and admin override.
 *
 * opts:
 *   billingCycle  'monthly' | 'yearly' | 'none'   (default 'none')
 *   withTrial     boolean — start a trial if the package supports it
 *   changedBy     userId who triggered the change
 *   action        history action override (else inferred)
 *   adminOverride boolean — allow targeting an is_available=false package
 *   reason        free-text note for history
 */
const subscribe = async (userId, packageSlug, opts = {}) => {
  const {
    billingCycle = 'none',
    withTrial = false,
    changedBy = null,
    action: actionOverride = null,
    adminOverride = false,
    reason = null
  } = opts;

  return sequelize.transaction(async (transaction) => {
    const pkg = await getPackageBySlug(packageSlug, { transaction });

    if (!pkg.is_available && !adminOverride) {
      throw new SubscriptionError(
        `The ${pkg.name} plan is coming soon and cannot be selected yet.`,
        'PACKAGE_UNAVAILABLE',
        403,
        { slug: pkg.slug }
      );
    }

    const existing = await Subscription.findOne({ where: { user_id: userId }, transaction });
    const fromPackageId = existing ? existing.package_id : null;

    // Trial handling
    const now = new Date();
    let status = 'active';
    let trialEndsAt = null;
    if (withTrial && pkg.trial_days > 0) {
      status = 'trialing';
      trialEndsAt = new Date(now.getTime() + pkg.trial_days * 24 * 60 * 60 * 1000);
    }

    // Period handling (free / 'none' cycle => non-expiring)
    let currentPeriodEnd = null;
    if (billingCycle === 'monthly') {
      currentPeriodEnd = new Date(now.getTime());
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    } else if (billingCycle === 'yearly') {
      currentPeriodEnd = new Date(now.getTime());
      currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
    }

    const fields = {
      package_id: pkg.id,
      status,
      billing_cycle: billingCycle,
      started_at: now,
      current_period_start: now,
      current_period_end: currentPeriodEnd,
      trial_ends_at: trialEndsAt,
      cancel_at: null,
      canceled_at: null
    };

    let subscription;
    if (existing) {
      subscription = await existing.update(fields, { transaction });
    } else {
      subscription = await Subscription.create({ user_id: userId, ...fields }, { transaction });
    }

    // Infer history action if not explicitly provided
    let action = actionOverride;
    if (!action) {
      if (!existing) action = 'created';
      else if (status === 'trialing') action = 'trial_started';
      else {
        const fromPkg = fromPackageId
          ? await Package.findByPk(fromPackageId, { transaction })
          : null;
        if (fromPkg && pkg.tier > fromPkg.tier) action = 'upgraded';
        else if (fromPkg && pkg.tier < fromPkg.tier) action = 'downgraded';
        else action = 'created';
      }
    }

    await recordHistory(
      { userId, fromPackageId, toPackageId: pkg.id, action, changedBy, reason },
      { transaction }
    );

    logger.info(`Subscription ${action} for user ${userId} → ${pkg.slug}`);

    // Reload with package association
    return Subscription.findByPk(subscription.id, {
      include: [{ model: Package, as: 'package' }],
      transaction
    });
  });
};

/** Upgrade / downgrade self. Thin wrapper over subscribe with sensible defaults. */
const changePlan = async (userId, newPackageSlug, changedBy, opts = {}) => {
  return subscribe(userId, newPackageSlug, { ...opts, changedBy });
};

/**
 * Cancel a subscription. For paid plans you'd schedule cancellation at
 * period end; for free/internal grants we cancel immediately and drop the
 * user back to the default (Basic) plan so they keep access to core HR.
 */
const cancelSubscription = async (userId, opts = {}) => {
  const { changedBy = null, reason = null, immediate = true } = opts;

  return sequelize.transaction(async (transaction) => {
    const existing = await Subscription.findOne({ where: { user_id: userId }, transaction });
    if (!existing) {
      throw new SubscriptionError('No active subscription to cancel', 'NO_SUBSCRIPTION', 404);
    }

    const fromPackageId = existing.package_id;
    const now = new Date();

    if (immediate) {
      const basic = await getPackageBySlug(DEFAULT_PACKAGE_SLUG, { transaction });
      await existing.update(
        {
          package_id: basic.id,
          status: 'active',
          billing_cycle: 'none',
          current_period_end: null,
          trial_ends_at: null,
          canceled_at: now,
          cancel_at: null
        },
        { transaction }
      );
      await recordHistory(
        { userId, fromPackageId, toPackageId: basic.id, action: 'canceled', changedBy, reason },
        { transaction }
      );
    } else {
      await existing.update({ status: 'canceled', cancel_at: existing.current_period_end, canceled_at: now }, { transaction });
      await recordHistory(
        { userId, fromPackageId, toPackageId: fromPackageId, action: 'canceled', changedBy, reason },
        { transaction }
      );
    }

    logger.info(`Subscription canceled for user ${userId}`);
    return getActiveSubscription(userId, { transaction });
  });
};

/**
 * Cron worker: move expired trials and expired billing periods back to Basic.
 * Returns a summary count. Safe to run repeatedly.
 */
const expireTrials = async () => {
  const now = new Date();
  const basic = await getPackageBySlug(DEFAULT_PACKAGE_SLUG);
  let trialsExpired = 0;
  let periodsExpired = 0;

  // 1) Trials whose trial_ends_at has passed → fall back to Basic
  const expiredTrials = await Subscription.findAll({
    where: { status: 'trialing', trial_ends_at: { [Op.lt]: now } }
  });
  for (const sub of expiredTrials) {
    const fromPackageId = sub.package_id;
    await sequelize.transaction(async (transaction) => {
      await sub.update(
        { package_id: basic.id, status: 'active', billing_cycle: 'none', current_period_end: null, trial_ends_at: null },
        { transaction }
      );
      await recordHistory(
        { userId: sub.user_id, fromPackageId, toPackageId: basic.id, action: 'trial_ended', reason: 'Trial expired (auto)' },
        { transaction }
      );
    });
    trialsExpired++;
  }

  // 2) Paid periods that lapsed → mark expired then drop to Basic
  const expiredPeriods = await Subscription.findAll({
    where: {
      status: 'active',
      billing_cycle: { [Op.in]: ['monthly', 'yearly'] },
      current_period_end: { [Op.lt]: now }
    }
  });
  for (const sub of expiredPeriods) {
    const fromPackageId = sub.package_id;
    await sequelize.transaction(async (transaction) => {
      await sub.update(
        { package_id: basic.id, status: 'active', billing_cycle: 'none', current_period_end: null },
        { transaction }
      );
      await recordHistory(
        { userId: sub.user_id, fromPackageId, toPackageId: basic.id, action: 'downgraded', reason: 'Billing period expired (auto)' },
        { transaction }
      );
    });
    periodsExpired++;
  }

  if (trialsExpired || periodsExpired) {
    logger.info(`Subscription maintenance: ${trialsExpired} trials, ${periodsExpired} periods expired → Basic`);
  }
  return { trialsExpired, periodsExpired };
};

/** Get a user's subscription history (newest first). */
const getHistory = async (userId) => {
  return SubscriptionHistory.findAll({
    where: { user_id: userId },
    include: [
      { model: Package, as: 'from_package', attributes: ['id', 'name', 'slug', 'tier'] },
      { model: Package, as: 'to_package', attributes: ['id', 'name', 'slug', 'tier'] }
    ],
    order: [['created_at', 'DESC']]
  });
};

module.exports = {
  SubscriptionError,
  getPackageBySlug,
  getActiveSubscription,
  getUserFeatures,
  getUserLimits,
  hasFeature,
  checkLimit,
  subscribe,
  changePlan,
  cancelSubscription,
  expireTrials,
  getHistory,
  recordHistory
};
