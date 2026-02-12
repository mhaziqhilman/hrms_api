const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Employee, Company, UserCompany, Invitation } = require('../models');
const { Op } = require('sequelize');
const jwtConfig = require('../config/jwt');
const { sendPasswordResetEmail, sendWelcomeEmail, sendVerificationEmail } = require('../services/emailService');
const { generateRandomString } = require('../utils/helpers');
const { linkEmployeeToUser } = require('../services/invitationService');
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
 * User registration
 */
const register = async (req, res, next) => {
  try {
    const { email, password, fullName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Generate email verification token
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = crypto
      .createHash('sha256')
      .update(rawVerificationToken)
      .digest('hex');

    // Create new user
    const user = await User.create({
      email,
      password,
      role: 'staff',
      email_verified: false,
      email_verification_token: hashedVerificationToken,
      email_verification_expires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    // Generate auth token
    const token = generateToken(user);

    // Send verification email
    try {
      await sendVerificationEmail(email, rawVerificationToken, fullName || 'User');
    } catch (emailError) {
      logger.error(`Failed to send verification email to ${email}: ${emailError.message}`);
    }

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          email_verified: user.email_verified,
          company_id: user.company_id
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * User login
 */
const login = async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Find user (Employee and Company associations are optional)
    const user = await User.findOne({
      where: { email },
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
      ]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Account is locked due to multiple failed login attempts. Please try again later.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // Increment failed login attempts
      user.failed_login_attempts += 1;

      // Lock account after 5 failed attempts
      if (user.failed_login_attempts >= 5) {
        user.locked_until = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
        await user.save();

        return res.status(401).json({
          success: false,
          message: 'Account locked due to multiple failed login attempts. Please try again after 30 minutes.'
        });
      }

      await user.save();

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact HR.'
      });
    }

    // Reset failed login attempts and update last login
    user.failed_login_attempts = 0;
    user.locked_until = null;
    user.last_login_at = new Date();
    await user.save();

    // Auto-accept pending invitations if user has verified email but no company
    // Skip for super_admin — they remain company-agnostic
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

        logger.info(`Auto-accepted invitation for ${user.email} to company ${pendingInvitation.company_id} during login`);

        // Reload company association for the response
        await user.reload({
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
          ]
        });
      } else {
        // Auto-repair: user has no company_id but may have existing memberships
        const existingMembership = await UserCompany.findOne({
          where: { user_id: user.id },
          include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'registration_no', 'logo_url'] }],
          order: [['joined_at', 'ASC']]
        });

        if (existingMembership) {
          user.company_id = existingMembership.company_id;
          user.role = existingMembership.role;
          await user.save();

          // Reload to pick up company association
          await user.reload({
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
            ]
          });

          logger.info(`Auto-repaired company_id for ${user.email} from membership → company ${existingMembership.company_id}`);
        }
      }
    }

    // Generate token
    const token = generateToken(user);

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

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          email_verified: user.email_verified,
          company_id: user.company_id,
          employee: user.employee,
          company: user.company,
          company_memberships: companyMemberships
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user
 */
const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: { exclude: ['created_at', 'updated_at', 'deleted_at'] },
          required: false
        },
        {
          model: Company,
          as: 'company',
          attributes: ['id', 'name', 'registration_no', 'logo_url'],
          required: false
        },
        {
          model: UserCompany,
          as: 'company_memberships',
          include: [{
            model: Company,
            as: 'company',
            attributes: ['id', 'name', 'registration_no', 'logo_url']
          }]
        }
      ],
      attributes: { exclude: ['password', 'email_verification_token', 'email_verification_expires'] }
    });

    // For super_admin: override company_id from JWT viewing context (not persisted in DB)
    if (user.role === 'super_admin' && req.user.company_id) {
      user.dataValues.company_id = req.user.company_id;
      // Fetch the viewing company if not already the associated one
      if (!user.company || user.company.id !== req.user.company_id) {
        const viewingCompany = await Company.findByPk(req.user.company_id, {
          attributes: ['id', 'name', 'registration_no', 'logo_url']
        });
        user.dataValues.company = viewingCompany;
      }
      // Also set the correct employee for this company context
      const contextEmployee = await Employee.findOne({
        where: { user_id: user.id, company_id: req.user.company_id },
        attributes: { exclude: ['created_at', 'updated_at', 'deleted_at'] }
      });
      if (contextEmployee) {
        user.dataValues.employee = contextEmployee;
      }
    }

    // Auto-repair: if user has no company_id but has company memberships, restore it
    if (!user.company_id && user.role !== 'super_admin' && user.company_memberships && user.company_memberships.length > 0) {
      const firstMembership = user.company_memberships[0];
      await User.update(
        { company_id: firstMembership.company_id, role: firstMembership.role },
        { where: { id: user.id } }
      );
      user.dataValues.company_id = firstMembership.company_id;
      user.dataValues.role = firstMembership.role;
      user.dataValues.company = firstMembership.company;
      // Load the correct employee for the restored company
      const restoredEmployee = await Employee.findOne({
        where: { user_id: user.id, company_id: firstMembership.company_id },
        attributes: { exclude: ['created_at', 'updated_at', 'deleted_at'] }
      });
      if (restoredEmployee) {
        user.dataValues.employee = restoredEmployee;
      }
      logger.info(`Auto-repaired company_id for user ${user.email} → company ${firstMembership.company_id}`);
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Request password reset
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({
      where: { email },
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['full_name']
      }]
    });

    // Don't reveal if email exists or not
    if (!user) {
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = generateRandomString(64);
    user.reset_password_token = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    user.reset_password_expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await user.save();

    // Send email
    await sendPasswordResetEmail(
      email,
      resetToken,
      user.employee?.full_name || 'User'
    );

    logger.info(`Password reset requested for: ${email}`);

    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    // Hash the token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      where: {
        reset_password_token: hashedToken
      }
    });

    if (!user || user.reset_password_expires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Update password
    user.password = newPassword;
    user.reset_password_token = null;
    user.reset_password_expires = null;
    user.failed_login_attempts = 0;
    user.locked_until = null;

    await user.save();

    logger.info(`Password reset successful for: ${user.email}`);

    res.json({
      success: true,
      message: 'Password reset successful. Please login with your new password.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout
 */
const logout = async (req, res, next) => {
  try {
    // In stateless JWT, logout is handled client-side by removing token
    // Can implement token blacklist here if needed

    logger.info(`User logged out: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change password (authenticated user)
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Validate new password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
      });
    }

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Check if new password is same as current
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    // Update password (will be auto-hashed by User model hooks)
    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify email address
 */
const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;

    // Hash the token to match stored hash
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid verification token
    const user = await User.findOne({
      where: {
        email_verification_token: hashedToken
      }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token'
      });
    }

    if (user.email_verification_expires < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Verification token has expired. Please request a new one.'
      });
    }

    // Mark email as verified
    user.email_verified = true;
    user.email_verification_token = null;
    user.email_verification_expires = null;
    await user.save();

    logger.info(`Email verified for: ${user.email}`);

    // Auto-accept any pending invitations for this email
    let invitationAccepted = false;
    if (!user.company_id) {
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
        // Accept the invitation
        user.company_id = pendingInvitation.company_id;
        user.role = pendingInvitation.role;
        await user.save();

        // Create UserCompany membership
        await UserCompany.findOrCreate({
          where: { user_id: user.id, company_id: pendingInvitation.company_id },
          defaults: {
            role: pendingInvitation.role,
            employee_id: null,
            joined_at: new Date()
          }
        });

        // Mark invitation as accepted
        await pendingInvitation.update({ status: 'accepted', accepted_at: new Date() });

        // Auto-link employee profile by matching email
        await linkEmployeeToUser(user.id, user.email, pendingInvitation.company_id);

        invitationAccepted = true;
        logger.info(`Auto-accepted invitation for ${user.email} to company ${pendingInvitation.company_id}`);
      }
    }

    // Generate new token with updated data (includes company_id if invitation was accepted)
    const authToken = generateToken(user);

    res.json({
      success: true,
      message: invitationAccepted
        ? 'Email verified and invitation accepted successfully'
        : 'Email verified successfully',
      data: {
        token: authToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          email_verified: user.email_verified,
          company_id: user.company_id
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resend verification email
 */
const resendVerification = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    // Generate new verification token
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = crypto
      .createHash('sha256')
      .update(rawVerificationToken)
      .digest('hex');

    user.email_verification_token = hashedVerificationToken;
    user.email_verification_expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    // Send verification email
    await sendVerificationEmail(user.email, rawVerificationToken, 'User');

    logger.info(`Verification email resent to: ${user.email}`);

    res.json({
      success: true,
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  logout,
  changePassword,
  verifyEmail,
  resendVerification
};
