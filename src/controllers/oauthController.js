const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const jwtConfig = require('../config/jwt');
const { User, Employee, Company, UserCompany } = require('../models');
const logger = require('../utils/logger');

/**
 * Generate JWT token (same pattern as authController)
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      employee_id: user.employee_id || null,
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
 * Generate and persist a refresh token for a user (7-day, one-time use)
 * Same logic as authController.generateAndSaveRefreshToken
 */
const generateAndSaveRefreshToken = async (user) => {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await user.update({ refresh_token: refreshToken, refresh_token_expires_at: expiresAt });
  return refreshToken;
};

/**
 * Handle OAuth callback success — generates JWT and redirects to frontend
 */
const oauthCallback = async (req, res) => {
  try {
    const user = req.user;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';

    if (!user) {
      return res.redirect(`${frontendUrl}/auth/login?error=oauth_failed`);
    }

    // Reload user with associations for the response
    const fullUser = await User.findByPk(user.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'full_name', 'employee_id', 'department', 'position'],
          required: false
        },
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name', 'registration_no', 'logo_url'],
          required: false
        }
      ],
      attributes: { exclude: ['password', 'email_verification_token', 'email_verification_expires', 'oauth_provider_id'] }
    });

    // Fetch company memberships
    const companyMemberships = await UserCompany.findAll({
      where: { user_id: user.id },
      include: [{
        model: Company,
        as: 'company',
        attributes: ['id', 'name', 'registration_no', 'logo_url']
      }],
      order: [['joined_at', 'ASC']]
    });

    const token = generateToken(fullUser);
    const refreshToken = await generateAndSaveRefreshToken(fullUser);

    // Build user object for frontend
    const userData = {
      id: fullUser.id,
      email: fullUser.email,
      role: fullUser.role,
      email_verified: fullUser.email_verified,
      company_id: fullUser.company_id,
      employee: fullUser.employee,
      company: fullUser.company,
      company_memberships: companyMemberships,
      oauth_provider: fullUser.oauth_provider,
      avatar_url: fullUser.avatar_url
    };

    const encodedUser = encodeURIComponent(JSON.stringify(userData));
    const encodedToken = encodeURIComponent(token);
    const encodedRefreshToken = encodeURIComponent(refreshToken);

    logger.info(`OAuth login successful for ${fullUser.email}, redirecting to frontend`);

    res.redirect(`${frontendUrl}/auth/oauth-callback?token=${encodedToken}&refreshToken=${encodedRefreshToken}&user=${encodedUser}`);
  } catch (error) {
    logger.error(`OAuth callback error: ${error.message}`);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    res.redirect(`${frontendUrl}/auth/login?error=oauth_failed`);
  }
};

module.exports = { oauthCallback };
