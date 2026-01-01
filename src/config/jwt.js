require('dotenv').config();

module.exports = {
  secret: process.env.JWT_SECRET || 'hrms-secret-key-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  algorithm: 'HS256',

  // Token options
  options: {
    issuer: 'HRMS-API',
    audience: 'HRMS-Client'
  },

  // Session timeout (in minutes)
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 60,

  // Remember me duration (in days)
  rememberMeDuration: parseInt(process.env.REMEMBER_ME_DURATION) || 30
};
