/**
 * Simple Role-Based Access Control Middleware
 * Basic role checking - detailed permissions handled by Angular routing guards
 */

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

const requireAdmin = requireRole(['super_admin', 'admin']);
const requireManager = requireRole(['super_admin', 'admin', 'manager']);

module.exports = {
  requireRole,
  requireAdmin,
  requireManager
};
