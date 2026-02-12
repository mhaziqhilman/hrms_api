const crypto = require('crypto');
const { Op } = require('sequelize');
const { Invitation, User, Company, UserCompany, Employee } = require('../models');
const { sendInvitationEmail } = require('./emailService');
const logger = require('../utils/logger');

/**
 * Auto-link an employee record to a user account by matching email + company.
 * Called after invitation acceptance to bridge the Employee ↔ User gap.
 */
const linkEmployeeToUser = async (userId, userEmail, companyId) => {
  try {
    const employee = await Employee.findOne({
      where: {
        email: userEmail,
        company_id: companyId,
        user_id: null
      }
    });

    if (!employee) return null;

    // Link employee → user
    await employee.update({ user_id: userId });

    // Update UserCompany with employee_id reference
    await UserCompany.update(
      { employee_id: employee.employee_id },
      { where: { user_id: userId, company_id: companyId } }
    );

    logger.info(`Auto-linked employee ${employee.employee_id} to user ${userId} in company ${companyId}`);
    return employee;
  } catch (error) {
    logger.error(`Failed to auto-link employee for user ${userId} in company ${companyId}: ${error.message}`);
    return null;
  }
};

/**
 * Create and send an invitation
 */
const createInvitation = async (companyId, invitedByUserId, email, role = 'staff') => {
  // Check if there's already a pending invitation for this email in this company
  const existingInvitation = await Invitation.findOne({
    where: {
      company_id: companyId,
      email,
      status: 'pending',
      expires_at: { [Op.gt]: new Date() }
    }
  });

  if (existingInvitation) {
    throw new Error('An active invitation already exists for this email');
  }

  // Check if user with this email already belongs to this company (via UserCompany)
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    const existingMembership = await UserCompany.findOne({
      where: { user_id: existingUser.id, company_id: companyId }
    });
    if (existingMembership) {
      throw new Error('A user with this email is already a member of this company');
    }
  }

  // Generate invitation token
  const rawToken = crypto.randomBytes(32).toString('hex');

  // Get inviter and company info for the email
  const inviter = await User.findByPk(invitedByUserId, {
    include: [{ model: require('../models/Employee'), as: 'employee', attributes: ['full_name'], required: false }]
  });
  const company = await Company.findByPk(companyId);

  // Create invitation
  const invitation = await Invitation.create({
    company_id: companyId,
    invited_by: invitedByUserId,
    email,
    role,
    token: rawToken,
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });

  // Send invitation email
  try {
    const inviterName = inviter?.employee?.full_name || inviter?.email || 'Your colleague';
    await sendInvitationEmail(email, inviterName, company.name, rawToken);
  } catch (emailError) {
    logger.error(`Failed to send invitation email to ${email}: ${emailError.message}`);
  }

  logger.info(`Invitation sent to ${email} for company ${companyId} by user ${invitedByUserId}`);

  return invitation;
};

/**
 * Accept an invitation
 */
const acceptInvitation = async (token, userId) => {
  const invitation = await Invitation.findOne({
    where: {
      token,
      status: 'pending'
    },
    include: [{
      model: Company,
      as: 'company',
      attributes: ['id', 'name']
    }]
  });

  if (!invitation) {
    throw new Error('Invalid or already used invitation');
  }

  if (invitation.expires_at < new Date()) {
    await invitation.update({ status: 'expired' });
    throw new Error('This invitation has expired');
  }

  // Fetch current user to preserve super_admin role
  const currentUser = await User.findByPk(userId, { attributes: ['id', 'role'] });
  const newRole = currentUser.role === 'super_admin' ? 'super_admin' : invitation.role;

  // Update the user's active company_id and role
  await User.update(
    {
      company_id: invitation.company_id,
      role: newRole
    },
    { where: { id: userId } }
  );

  // Create UserCompany membership record
  await UserCompany.findOrCreate({
    where: { user_id: userId, company_id: invitation.company_id },
    defaults: {
      role: invitation.role,
      employee_id: null,
      joined_at: new Date()
    }
  });

  // Auto-link employee profile by matching email
  await linkEmployeeToUser(userId, invitation.email, invitation.company_id);

  // Mark invitation as accepted
  await invitation.update({
    status: 'accepted',
    accepted_at: new Date()
  });

  logger.info(`Invitation accepted by user ${userId} for company ${invitation.company_id}`);

  // Return updated user
  const user = await User.findByPk(userId, {
    include: [{
      model: Company,
      as: 'company',
      attributes: ['id', 'name'],
      required: false
    }],
    attributes: { exclude: ['password', 'email_verification_token', 'email_verification_expires'] }
  });

  return user;
};

/**
 * Get invitations for a company
 */
const getCompanyInvitations = async (companyId, { page = 1, limit = 20, status } = {}) => {
  const where = { company_id: companyId };
  if (status) {
    where.status = status;
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await Invitation.findAndCountAll({
    where,
    include: [{
      model: User,
      as: 'inviter',
      attributes: ['id', 'email']
    }],
    order: [['created_at', 'DESC']],
    limit,
    offset
  });

  return {
    invitations: rows,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit)
    }
  };
};

/**
 * Cancel an invitation
 */
const cancelInvitation = async (invitationId, userId) => {
  const invitation = await Invitation.findByPk(invitationId);

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.status !== 'pending') {
    throw new Error('Only pending invitations can be cancelled');
  }

  await invitation.update({ status: 'cancelled' });

  logger.info(`Invitation ${invitationId} cancelled by user ${userId}`);

  return invitation;
};

/**
 * Resend an invitation
 */
const resendInvitation = async (invitationId, userId) => {
  const invitation = await Invitation.findByPk(invitationId, {
    include: [{
      model: Company,
      as: 'company'
    }]
  });

  if (!invitation) {
    throw new Error('Invitation not found');
  }

  if (invitation.status !== 'pending') {
    throw new Error('Only pending invitations can be resent');
  }

  // Generate new token and reset expiry
  const newToken = crypto.randomBytes(32).toString('hex');
  await invitation.update({
    token: newToken,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  // Get inviter info
  const inviter = await User.findByPk(userId, {
    include: [{ model: require('../models/Employee'), as: 'employee', attributes: ['full_name'], required: false }]
  });

  // Send email
  try {
    const inviterName = inviter?.employee?.full_name || inviter?.email || 'Your colleague';
    await sendInvitationEmail(invitation.email, inviterName, invitation.company.name, newToken);
  } catch (emailError) {
    logger.error(`Failed to resend invitation email to ${invitation.email}: ${emailError.message}`);
  }

  logger.info(`Invitation ${invitationId} resent by user ${userId}`);

  return invitation;
};

module.exports = {
  createInvitation,
  acceptInvitation,
  getCompanyInvitations,
  cancelInvitation,
  resendInvitation,
  linkEmployeeToUser
};
