const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const { User, Company, Employee } = require('../models');
const companyService = require('../services/companyService');
const invitationService = require('../services/invitationService');
const storageService = require('../services/supabaseStorageService');
const logger = require('../utils/logger');

/**
 * Generate JWT token (same as authController)
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
 * Setup company (wizard completion endpoint)
 * Creates company, initial employee, and sends invitations in one transaction
 */
const setupCompany = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { company, initialEmployee, invitations } = req.body;

    // Create company and initial employee
    const result = await companyService.createCompany(userId, company, initialEmployee);

    // Send invitations if provided
    const sentInvitations = [];
    if (invitations && invitations.length > 0) {
      for (const invite of invitations) {
        try {
          const invitation = await invitationService.createInvitation(
            result.company.id,
            userId,
            invite.email,
            invite.role || 'staff'
          );
          sentInvitations.push(invitation);
        } catch (inviteError) {
          logger.warn(`Failed to send invitation to ${invite.email}: ${inviteError.message}`);
        }
      }
    }

    // Fetch updated user to generate new token
    const updatedUser = await User.findByPk(userId, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'full_name', 'employee_id', 'department', 'position'],
          required: false,
          where: { company_id: result.company.id }
        },
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name'],
          required: false
        }
      ]
    });

    const token = generateToken(updatedUser);

    res.status(201).json({
      success: true,
      message: 'Company setup completed successfully',
      data: {
        token,
        company: result.company,
        employee: result.employee,
        invitationsSent: sentInvitations.length,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          email_verified: updatedUser.email_verified,
          company_id: updatedUser.company_id,
          employee: updatedUser.employee,
          company: updatedUser.company
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user's company
 */
const getMyCompany = async (req, res, next) => {
  try {
    const company = await companyService.getCompanyByUserId(req.user.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'No company found for this user'
      });
    }

    // Resolve logo storage path to a signed URL
    const companyData = company.toJSON ? company.toJSON() : { ...company };
    if (companyData.logo_url && !companyData.logo_url.startsWith('http') && storageService.isConfigured()) {
      try {
        companyData.logo_url = await storageService.getSignedUrl(companyData.logo_url, 7 * 24 * 3600);
      } catch (err) {
        logger.error('Failed to generate logo signed URL:', err.message);
      }
    }

    res.json({
      success: true,
      data: companyData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update company
 */
const updateCompany = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user.company_id) {
      return res.status(404).json({
        success: false,
        message: 'No company found'
      });
    }

    const company = await companyService.updateCompany(user.company_id, req.body);

    res.json({
      success: true,
      message: 'Company updated successfully',
      data: company
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all companies (super_admin only)
 */
const getAllCompanies = async (req, res, next) => {
  try {
    const companies = await companyService.getAllCompanies();

    // Resolve logo storage paths to signed URLs
    const companiesData = companies.map(c => c.toJSON ? c.toJSON() : { ...c });
    if (storageService.isConfigured()) {
      for (const comp of companiesData) {
        if (comp.logo_url && !comp.logo_url.startsWith('http')) {
          try {
            comp.logo_url = await storageService.getSignedUrl(comp.logo_url, 7 * 24 * 3600);
          } catch (err) { /* skip */ }
        }
      }
    }

    res.json({
      success: true,
      data: companiesData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all companies the current user belongs to
 */
const getMyCompanies = async (req, res, next) => {
  try {
    const memberships = await companyService.getUserCompanies(req.user.id);

    // Resolve logo storage paths to signed URLs
    if (storageService.isConfigured()) {
      for (const m of memberships) {
        const comp = m.company || m.dataValues?.company;
        if (comp && comp.logo_url && !comp.logo_url.startsWith('http')) {
          try {
            comp.logo_url = await storageService.getSignedUrl(comp.logo_url, 7 * 24 * 3600);
          } catch (err) { /* skip */ }
        }
      }
    }

    res.json({
      success: true,
      data: memberships
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Switch active company
 */
const switchCompany = async (req, res, next) => {
  try {
    const { company_id } = req.body;
    const userId = req.user.id;

    const updatedUser = await companyService.switchCompany(userId, company_id);
    const token = generateToken(updatedUser);

    // Resolve company logo storage path to signed URL
    const companyData = updatedUser.company
      ? (updatedUser.company.toJSON ? updatedUser.company.toJSON() : { ...updatedUser.company })
      : null;
    if (companyData && companyData.logo_url && !companyData.logo_url.startsWith('http') && storageService.isConfigured()) {
      try {
        companyData.logo_url = await storageService.getSignedUrl(companyData.logo_url, 7 * 24 * 3600);
      } catch (err) {
        logger.error('Failed to generate logo signed URL on switch:', err.message);
      }
    }

    res.json({
      success: true,
      message: 'Company switched successfully',
      data: {
        token,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          email_verified: updatedUser.email_verified,
          company_id: updatedUser.company_id,
          employee: updatedUser.employee,
          company: companyData
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear super_admin's viewing company context
 */
const clearCompanyContext = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const updatedUser = await companyService.clearCompanyContext(userId);
    const token = generateToken(updatedUser);

    res.json({
      success: true,
      message: 'Company context cleared',
      data: {
        token,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          email_verified: updatedUser.email_verified,
          company_id: null,
          employee: null,
          company: null
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  setupCompany,
  getMyCompany,
  getAllCompanies,
  getMyCompanies,
  switchCompany,
  clearCompanyContext,
  updateCompany
};
