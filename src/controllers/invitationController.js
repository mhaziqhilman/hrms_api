const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const { User, Company, UserCompany, Invitation } = require('../models');
const { Op } = require('sequelize');
const invitationService = require('../services/invitationService');
const { linkEmployeeToUser } = invitationService;
const logger = require('../utils/logger');

/**
 * Generate JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      employee_id: user.employee_id,
      company_id: user.company_id || null,
      email_verified: user.email_verified || false
    },
    jwtConfig.secret,
    {
      expiresIn: jwtConfig.expiresIn,
      issuer: jwtConfig.options.issuer,
      audience: jwtConfig.options.audience
    }
  );
};

/**
 * Invite a user to the company
 */
const inviteUser = async (req, res, next) => {
  try {
    const { email, role } = req.body;
    const user = await User.findByPk(req.user.id);

    if (!user.company_id) {
      return res.status(400).json({
        success: false,
        message: 'You must belong to a company to send invitations'
      });
    }

    const invitation = await invitationService.createInvitation(
      user.company_id,
      req.user.id,
      email,
      role
    );

    res.status(201).json({
      success: true,
      message: `Invitation sent to ${email}`,
      data: invitation
    });
  } catch (error) {
    if (error.message.includes('already exists') || error.message.includes('already a member')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

/**
 * Accept an invitation (can be called by authenticated users)
 */
const acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.body;

    // This endpoint requires authentication - the user must be logged in
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'You must be logged in to accept an invitation'
      });
    }

    const user = await invitationService.acceptInvitation(token, req.user.id);

    // Generate new token with updated company_id
    const authToken = generateToken(user);

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      data: {
        token: authToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          email_verified: user.email_verified,
          company_id: user.company_id,
          company: user.company
        }
      }
    });
  } catch (error) {
    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

/**
 * Get invitations for the user's company
 */
const getInvitations = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);

    if (!user.company_id) {
      return res.status(400).json({
        success: false,
        message: 'You must belong to a company to view invitations'
      });
    }

    const { page, limit, status } = req.query;

    const result = await invitationService.getCompanyInvitations(user.company_id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel a pending invitation
 */
const cancelInvitation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const invitation = await invitationService.cancelInvitation(id, req.user.id);

    res.json({
      success: true,
      message: 'Invitation cancelled',
      data: invitation
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('Only pending')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

/**
 * Resend an invitation
 */
const resendInvitation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const invitation = await invitationService.resendInvitation(id, req.user.id);

    res.json({
      success: true,
      message: 'Invitation resent successfully',
      data: invitation
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('Only pending')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

/**
 * Auto-accept pending invitations for the authenticated user's email
 */
const autoAccept = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Already has a company - nothing to do
    if (user.company_id) {
      return res.json({
        success: true,
        message: 'User already belongs to a company',
        data: { accepted: false }
      });
    }

    // Find pending invitation for this email
    const pendingInvitation = await Invitation.findOne({
      where: {
        email: user.email,
        status: 'pending',
        expires_at: { [Op.gt]: new Date() }
      },
      include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'registration_no', 'logo_url'] }],
      order: [['created_at', 'DESC']]
    });

    if (!pendingInvitation) {
      return res.json({
        success: true,
        message: 'No pending invitations found',
        data: { accepted: false }
      });
    }

    // Accept the invitation
    user.company_id = pendingInvitation.company_id;
    user.role = user.role === 'super_admin' ? 'super_admin' : pendingInvitation.role;
    await user.save();

    await UserCompany.findOrCreate({
      where: { user_id: user.id, company_id: pendingInvitation.company_id },
      defaults: {
        role: pendingInvitation.role,
        employee_id: null,
        joined_at: new Date()
      }
    });

    await pendingInvitation.update({ status: 'accepted', accepted_at: new Date() });

    // Auto-link employee profile by matching email
    await linkEmployeeToUser(user.id, user.email, pendingInvitation.company_id);

    logger.info(`Auto-accepted invitation for ${user.email} to company ${pendingInvitation.company_id}`);

    // Generate new token with updated data
    const authToken = generateToken(user);

    res.json({
      success: true,
      message: 'Invitation accepted successfully',
      data: {
        accepted: true,
        token: authToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          email_verified: user.email_verified,
          company_id: user.company_id,
          company: pendingInvitation.company
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get invitation info by token (public - no auth required)
 */
const getInvitationInfo = async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    const invitation = await Invitation.findOne({
      where: { token },
      include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'logo_url'] }]
    });

    if (!invitation) {
      return res.status(404).json({ success: false, message: 'Invitation not found' });
    }

    const isExpired = invitation.status !== 'pending' || new Date(invitation.expires_at) < new Date();

    res.json({
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expired: isExpired,
        company: invitation.company ? { name: invitation.company.name, logo_url: invitation.company.logo_url } : null
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  inviteUser,
  acceptInvitation,
  autoAccept,
  getInvitationInfo,
  getInvitations,
  cancelInvitation,
  resendInvitation
};
