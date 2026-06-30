/**
 * subscriptionController — user-facing + admin subscription endpoints.
 *
 * Mounted as:
 *   /api/packages              (public)        -> listPackages
 *   /api/subscription          (authed user)   -> me / usage / change / cancel / history
 *   /api/admin/subscriptions   (super_admin)   -> list / get / override / grant-trial
 */

const { Op } = require('sequelize');
const { User, Company, Employee, Package, Subscription } = require('../models');
const subscriptionService = require('../services/subscriptionService');
const logger = require('../utils/logger');

/** Map a SubscriptionError (or generic error) to an HTTP response. */
const handleError = (res, error, next) => {
  if (error && error.name === 'SubscriptionError') {
    return res.status(error.status || 400).json({
      success: false,
      code: error.code,
      message: error.message,
      ...error.extra
    });
  }
  return next(error);
};

/**
 * Compute a live usage snapshot for a user vs. their plan limits.
 * - max_companies counts only companies the user OWNS (created).
 * - max_employees_per_company is reported for the user's active company.
 */
const buildUsageSnapshot = async (user) => {
  const limits = await subscriptionService.getUserLimits(user.id);

  const companiesOwned = await Company.count({ where: { owner_id: user.id } });

  let employeesInActiveCompany = 0;
  if (user.company_id) {
    employeesInActiveCompany = await Employee.count({ where: { company_id: user.company_id } });
  }

  return {
    limits,
    usage: {
      max_companies: {
        current: companiesOwned,
        limit: limits.max_companies ?? -1
      },
      max_employees_per_company: {
        current: employeesInActiveCompany,
        limit: limits.max_employees_per_company ?? -1
      }
    }
  };
};

// ----- Public -----

/** GET /api/packages — list all active packages (incl. is_available flag). */
const listPackages = async (req, res, next) => {
  try {
    const packages = await Package.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC'], ['tier', 'ASC']]
    });
    res.json({ success: true, data: packages });
  } catch (error) {
    next(error);
  }
};

// ----- Authenticated user -----

/** GET /api/subscription/me — current subscription + package + usage. */
const getMySubscription = async (req, res, next) => {
  try {
    let subscription = await subscriptionService.getActiveSubscription(req.user.id);

    // Safety net: if somehow missing, lazily provision the default plan.
    if (!subscription) {
      subscription = await subscriptionService.subscribe(req.user.id, process.env.DEFAULT_PACKAGE_SLUG || 'basic', {
        action: 'created',
        reason: 'Lazy provision on first read'
      });
    }

    const { usage } = await buildUsageSnapshot(req.user);
    res.json({ success: true, data: { subscription, usage } });
  } catch (error) {
    handleError(res, error, next);
  }
};

/** GET /api/subscription/usage — live usage snapshot vs limits. */
const getMyUsage = async (req, res, next) => {
  try {
    const snapshot = await buildUsageSnapshot(req.user);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    next(error);
  }
};

/** POST /api/subscription/change — upgrade / downgrade self. */
const changeMyPlan = async (req, res, next) => {
  try {
    const { slug, billingCycle, withTrial } = req.body;
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Package slug is required' });
    }
    const subscription = await subscriptionService.changePlan(req.user.id, slug, req.user.id, {
      billingCycle: billingCycle || 'none',
      withTrial: !!withTrial
    });
    res.json({ success: true, message: 'Subscription updated', data: subscription });
  } catch (error) {
    handleError(res, error, next);
  }
};

/** POST /api/subscription/subscribe — alias of change (kept for API clarity). */
const subscribeMe = changeMyPlan;

/** POST /api/subscription/cancel — cancel own subscription (drops to Basic). */
const cancelMyPlan = async (req, res, next) => {
  try {
    const subscription = await subscriptionService.cancelSubscription(req.user.id, {
      changedBy: req.user.id,
      reason: req.body && req.body.reason
    });
    res.json({ success: true, message: 'Subscription canceled', data: subscription });
  } catch (error) {
    handleError(res, error, next);
  }
};

/** GET /api/subscription/history — own subscription history. */
const getMyHistory = async (req, res, next) => {
  try {
    const history = await subscriptionService.getHistory(req.user.id);
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
};

// ----- Admin (super_admin) -----

/** GET /api/admin/subscriptions — paginated list of all users' subscriptions. */
const adminListSubscriptions = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;
    const { search, packageSlug, status } = req.query;

    const subWhere = {};
    if (status) subWhere.status = status;

    const packageInclude = { model: Package, as: 'package' };
    if (packageSlug) {
      packageInclude.where = { slug: packageSlug };
      packageInclude.required = true;
    }

    const userInclude = {
      model: User,
      as: 'user',
      attributes: ['id', 'email', 'role', 'is_active', 'company_id']
    };
    if (search) {
      userInclude.where = { email: { [Op.iLike]: `%${search}%` } };
      userInclude.required = true;
    }

    const { count, rows } = await Subscription.findAndCountAll({
      where: subWhere,
      include: [userInclude, packageInclude],
      order: [['updated_at', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/admin/subscriptions/:userId — a single user's subscription + history. */
const adminGetSubscription = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const user = await User.findByPk(userId, { attributes: ['id', 'email', 'role', 'company_id', 'is_active'] });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const subscription = await subscriptionService.getActiveSubscription(userId);
    const history = await subscriptionService.getHistory(userId);
    res.json({ success: true, data: { user, subscription, history } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/subscriptions/:userId — manually override a user's plan.
 * Can target is_available=false packages (Pro/Enterprise) for internal testing.
 */
const adminOverridePlan = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { slug, billingCycle, reason } = req.body;
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Package slug is required' });
    }
    const user = await User.findByPk(userId, { attributes: ['id', 'email'] });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const subscription = await subscriptionService.subscribe(userId, slug, {
      billingCycle: billingCycle || 'none',
      adminOverride: true,
      action: 'admin_override',
      changedBy: req.user.id,
      reason: reason || `Manual override by ${req.user.email}`
    });

    logger.info(`Admin ${req.user.email} overrode user ${user.email} → ${slug}`);
    res.json({ success: true, message: 'Plan overridden', data: subscription });
  } catch (error) {
    handleError(res, error, next);
  }
};

/** POST /api/admin/subscriptions/:userId/grant-trial — grant a trial on a package. */
const adminGrantTrial = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { slug = 'professional', reason } = req.body;
    const user = await User.findByPk(userId, { attributes: ['id', 'email'] });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const subscription = await subscriptionService.subscribe(userId, slug, {
      withTrial: true,
      adminOverride: true,
      action: 'trial_started',
      changedBy: req.user.id,
      reason: reason || `Trial granted by ${req.user.email}`
    });

    logger.info(`Admin ${req.user.email} granted ${slug} trial to ${user.email}`);
    res.json({ success: true, message: 'Trial granted', data: subscription });
  } catch (error) {
    handleError(res, error, next);
  }
};

module.exports = {
  listPackages,
  getMySubscription,
  getMyUsage,
  changeMyPlan,
  subscribeMe,
  cancelMyPlan,
  getMyHistory,
  adminListSubscriptions,
  adminGetSubscription,
  adminOverridePlan,
  adminGrantTrial
};
