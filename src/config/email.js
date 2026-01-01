require('dotenv').config();

module.exports = {
  service: process.env.EMAIL_SERVICE || 'gmail',
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASSWORD || ''
  },
  from: {
    name: process.env.EMAIL_FROM_NAME || 'HRMS System',
    email: process.env.EMAIL_FROM_EMAIL || 'noreply@hrms.com'
  },
  templates: {
    resetPassword: {
      subject: 'Password Reset Request - HRMS',
      template: 'reset-password'
    },
    payslip: {
      subject: 'Your Payslip for {{month}} {{year}}',
      template: 'payslip-notification'
    },
    leaveApproval: {
      subject: 'Leave Request {{status}}',
      template: 'leave-status'
    },
    newEmployee: {
      subject: 'Welcome to {{companyName}} - HRMS Access',
      template: 'new-employee'
    }
  }
};
