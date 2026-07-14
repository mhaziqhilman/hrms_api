const { Op, fn, col, where: whereClause } = require('sequelize');
const { Employee, UserCompany, Company } = require('../models');

/**
 * Shared rules for deciding whether a user still has access to a company.
 *
 * An employee is "offboarded" once their employment_status is no longer
 * Active AND their last working day (end_date) has passed. A Resigned
 * employee serving notice (end_date today or later) keeps access through
 * their last working day; no end_date means the change applies immediately.
 */

const localDateString = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const isEmployeeOffboarded = (employee) => {
  if (!employee || employee.employment_status === 'Active') return false;
  if (!employee.end_date) return true;
  return String(employee.end_date).slice(0, 10) < localDateString();
};

const EMPLOYEE_GATE_ATTRS = ['id', 'employment_status', 'end_date'];

/**
 * The employee record that ties a user to a company for offboarding purposes:
 * the one linked by user_id, or — when an admin unlinked the profile — the
 * unlinked profile carrying the user's email (the same match rule the
 * invitation auto-link uses). Without the email fallback, "unlink then
 * terminate" would leave the user's access untouched.
 */
const findGateEmployee = async (userId, companyId, email) => {
  const linked = await Employee.findOne({
    where: { user_id: userId, company_id: companyId },
    attributes: EMPLOYEE_GATE_ATTRS
  });
  if (linked || !email) return { linked, gate: linked };
  const byEmail = await Employee.findOne({
    where: {
      company_id: companyId,
      user_id: null,
      [Op.and]: [whereClause(fn('lower', col('email')), email.toLowerCase())]
    },
    attributes: EMPLOYEE_GATE_ATTRS
  });
  return { linked: null, gate: byEmail };
};

/**
 * Check whether a user may act within a company right now.
 * Returns { allowed, code, employee } — employee is the LINKED company-scoped
 * record, null when the user has no profile there (e.g. company owners).
 * Not for super_admin: their company_id is a viewing context, not a membership.
 */
const checkCompanyAccess = async (userId, companyId, { role, email } = {}) => {
  const { linked, gate } = await findGateEmployee(userId, companyId, email);
  const employee = linked;

  if (isEmployeeOffboarded(gate)) {
    return { allowed: false, code: 'ACCOUNT_OFFBOARDED', employee };
  }

  const membership = await UserCompany.findOne({
    where: { user_id: userId, company_id: companyId, status: 'active' },
    attributes: ['id']
  });

  if (!membership) {
    // Pre-multi-company accounts may lack a membership row; a user with a
    // live employee profile in the company is legitimate, so heal the row
    // instead of locking them out. An 'inactive' membership is NOT healed —
    // findOrCreate returns the existing row without reactivating it.
    if (employee) {
      const [healed] = await UserCompany.findOrCreate({
        where: { user_id: userId, company_id: companyId },
        defaults: { role: role || 'staff', employee_id: null, joined_at: new Date(), status: 'active' }
      });
      if (healed.status !== 'active') {
        return { allowed: false, code: 'NO_COMPANY_ACCESS', employee };
      }
      return { allowed: true, employee };
    }
    return { allowed: false, code: 'NO_COMPANY_ACCESS', employee };
  }

  return { allowed: true, employee };
};

/**
 * Find the first company membership that still grants access — one where
 * the user either has no employee record or a non-offboarded one.
 * Used to pick a fallback active company at login and during auto-repair.
 */
const findUsableMembership = async (userId, { excludeCompanyId, email } = {}) => {
  const memberships = await UserCompany.findAll({
    where: { user_id: userId, status: 'active' },
    include: [{
      model: Company,
      as: 'company',
      attributes: ['id', 'name', 'registration_no', 'logo_url']
    }],
    order: [['joined_at', 'ASC']]
  });

  for (const membership of memberships) {
    if (excludeCompanyId && membership.company_id === excludeCompanyId) continue;
    const { gate } = await findGateEmployee(userId, membership.company_id, email);
    if (!isEmployeeOffboarded(gate)) return membership;
  }

  return null;
};

const OFFBOARD_MESSAGES = {
  ACCOUNT_OFFBOARDED: 'Your employment with this company has ended and access has been revoked. Please contact your administrator.',
  NO_COMPANY_ACCESS: 'You no longer have access to this company. Please contact your administrator.'
};

module.exports = {
  isEmployeeOffboarded,
  findGateEmployee,
  checkCompanyAccess,
  findUsableMembership,
  OFFBOARD_MESSAGES
};
