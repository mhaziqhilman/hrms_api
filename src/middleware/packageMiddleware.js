/**
 * packageMiddleware — feature/limit gating for the subscription tier system.
 *
 * BOTH guards are inert unless PACKAGE_ENFORCEMENT === 'true', and they ALWAYS
 * bypass super_admin. During the Basic-open phase enforcement is off and Basic
 * grants everything, so these are effectively pass-throughs — but they are
 * applied to routes now so launching tiers later is a config change only.
 */

const subscriptionService = require('../services/subscriptionService');
const logger = require('../utils/logger');

const enforcementEnabled = () => process.env.PACKAGE_ENFORCEMENT === 'true';
const isSuperAdmin = (req) => req.user && req.user.role === 'super_admin';

/**
 * Require a feature flag on the user's active package.
 *
 *   router.post('/calculate', requireFeature('payroll'), ctrl.calculate)
 *
 * On miss → 403 { code: 'FEATURE_LOCKED', feature, message }.
 */
const requireFeature = (featureKey) => {
  return async (req, res, next) => {
    if (!enforcementEnabled() || isSuperAdmin(req)) return next();

    try {
      const allowed = await subscriptionService.hasFeature(req.user.id, featureKey);
      if (allowed) return next();

      return res.status(403).json({
        success: false,
        code: 'FEATURE_LOCKED',
        feature: featureKey,
        message: `This feature requires a higher plan.`
      });
    } catch (error) {
      logger.error(`requireFeature(${featureKey}) error: ${error.message}`);
      return next(error);
    }
  };
};

/**
 * Enforce a numeric usage limit before a create action.
 *
 *   router.post('/', enforceLimit('max_companies', countOwnedCompanies), ctrl.create)
 *
 * currentValueResolver(req) → Promise<number>: the CURRENT usage count
 * (the new row is not yet created). Allowed when current < limit.
 * On exceed → 403 { code: 'LIMIT_REACHED', limit, current }.
 */
const enforceLimit = (limitKey, currentValueResolver) => {
  return async (req, res, next) => {
    if (!enforcementEnabled() || isSuperAdmin(req)) return next();

    try {
      const current = await currentValueResolver(req);
      const result = await subscriptionService.checkLimit(req.user.id, limitKey, current);
      if (result.allowed) return next();

      return res.status(403).json({
        success: false,
        code: 'LIMIT_REACHED',
        limit_key: limitKey,
        limit: result.limit,
        current: result.current,
        message: `You've reached your plan limit (${result.current}/${result.limit}). Upgrade for more.`
      });
    } catch (error) {
      logger.error(`enforceLimit(${limitKey}) error: ${error.message}`);
      return next(error);
    }
  };
};

// ----- Common resolvers -----

const { Company, Employee } = require('../models');

/** Count companies OWNED (created) by the requesting user. */
const countOwnedCompanies = (req) => Company.count({ where: { owner_id: req.user.id } });

/** Count employees in the user's active company. */
const countEmployeesInActiveCompany = (req) => {
  if (!req.user.company_id) return Promise.resolve(0);
  return Employee.count({ where: { company_id: req.user.company_id } });
};

module.exports = {
  requireFeature,
  enforceLimit,
  countOwnedCompanies,
  countEmployeesInActiveCompany
};
