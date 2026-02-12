const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const { User, Employee } = require('../models');

/**
 * Verify JWT token and attach user to request
 */
const verifyToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authorization denied.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, jwtConfig.secret, {
      issuer: jwtConfig.options.issuer,
      audience: jwtConfig.options.audience
    });

    // Check if user still exists
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Token invalid.'
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'User account is deactivated.'
      });
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Account is locked. Please try again later.'
      });
    }

    // Attach user to request
    req.user = user;

    // For super_admin: use company_id from JWT (view-only context) instead of DB
    // Super_admin's DB company_id is always null; their viewing context lives in the JWT
    if (user.role === 'super_admin' && decoded.company_id) {
      req.user.company_id = decoded.company_id;
    }

    // Look up employee_id for the active/viewing company
    const activeCompanyId = req.user.company_id;
    if (activeCompanyId) {
      const employee = await Employee.findOne({
        where: { user_id: user.id, company_id: activeCompanyId },
        attributes: ['id']
      });
      req.user.employee_id = employee ? employee.id : null;
    } else {
      req.user.employee_id = null;
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Authorization denied.'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication.'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, jwtConfig.secret);

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (user && user.is_active) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Continue without user context if token is invalid
    next();
  }
};

module.exports = {
  verifyToken,
  optionalAuth
};
