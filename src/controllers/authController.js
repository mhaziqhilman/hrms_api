const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Employee } = require('../models');
const jwtConfig = require('../config/jwt');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../services/emailService');
const { generateRandomString } = require('../utils/helpers');
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
      employee_id: user.employee_id
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

    // Create new user
    const user = await User.create({
      email,
      password,
      role: 'staff' // Default role
    });

    // Generate token
    const token = generateToken(user);

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
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

    // Find user (Employee association is optional)
    const user = await User.findOne({
      where: { email },
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'full_name', 'employee_id', 'department', 'position'],
        required: false
      }]
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

    // Generate token
    const token = generateToken(user);

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
          employee: user.employee
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
      include: [{
        model: Employee,
        as: 'employee',
        attributes: { exclude: ['created_at', 'updated_at', 'deleted_at'] }
      }],
      attributes: { exclude: ['password'] }
    });

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

module.exports = {
  register,
  login,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  logout
};
