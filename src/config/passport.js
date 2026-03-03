const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const { User, Employee, Company, UserCompany, Invitation } = require('../models');
const { Op } = require('sequelize');
const { linkEmployeeToUser } = require('../services/invitationService');
const logger = require('../utils/logger');

/**
 * Find existing user by email or create new one from OAuth profile.
 * Handles account linking (OAuth email matches existing password user).
 */
const findOrCreateOAuthUser = async (profile, provider) => {
  const email = profile.emails && profile.emails[0] && profile.emails[0].value;

  if (!email) {
    throw new Error(`No email provided by ${provider}. Please ensure your ${provider} account has a public email.`);
  }

  const providerId = profile.id;
  const avatarUrl = profile.photos && profile.photos[0] && profile.photos[0].value;

  // Try to find user by email (handles account linking)
  let user = await User.findOne({ where: { email } });

  if (user) {
    // Existing user — link OAuth provider if not already linked
    if (!user.oauth_provider) {
      user.oauth_provider = provider;
      user.oauth_provider_id = providerId;
    }
    if (avatarUrl && !user.avatar_url) {
      user.avatar_url = avatarUrl;
    }
    // Auto-verify email (OAuth provider guarantees it)
    if (!user.email_verified) {
      user.email_verified = true;
      user.email_verification_token = null;
      user.email_verification_expires = null;
    }
    user.last_login_at = new Date();
    user.failed_login_attempts = 0;
    user.locked_until = null;
    await user.save();

    logger.info(`Existing user ${email} logged in via ${provider} (account linked)`);
  } else {
    // New user — create account
    user = await User.create({
      email,
      password: null,
      role: 'staff',
      email_verified: true,
      oauth_provider: provider,
      oauth_provider_id: providerId,
      avatar_url: avatarUrl,
      is_active: true,
      last_login_at: new Date()
    });

    logger.info(`New user created via ${provider}: ${email}`);
  }

  // Auto-accept pending invitations (same logic as login controller)
  if (user.email_verified && !user.company_id && user.role !== 'super_admin') {
    const pendingInvitation = await Invitation.findOne({
      where: {
        email: user.email,
        status: 'pending',
        expires_at: { [Op.gt]: new Date() }
      },
      include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']]
    });

    if (pendingInvitation) {
      user.company_id = pendingInvitation.company_id;
      user.role = pendingInvitation.role;
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
      await linkEmployeeToUser(user.id, user.email, pendingInvitation.company_id);

      logger.info(`Auto-accepted invitation for ${user.email} to company ${pendingInvitation.company_id} during OAuth login`);
    }
  }

  return user;
};

const configurePassport = () => {
  // Google Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
      scope: ['profile', 'email']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateOAuthUser(profile, 'google');
        done(null, user);
      } catch (error) {
        logger.error(`Google OAuth error: ${error.message}`);
        done(error, null);
      }
    }));

    logger.info('Google OAuth strategy configured');
  } else {
    logger.warn('Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
  }

  // GitHub Strategy
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || '/api/auth/github/callback',
      scope: ['user:email']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateOAuthUser(profile, 'github');
        done(null, user);
      } catch (error) {
        logger.error(`GitHub OAuth error: ${error.message}`);
        done(error, null);
      }
    }));

    logger.info('GitHub OAuth strategy configured');
  } else {
    logger.warn('GitHub OAuth not configured (missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET)');
  }
};

module.exports = { configurePassport };
