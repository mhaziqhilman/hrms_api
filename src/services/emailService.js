const nodemailer = require('nodemailer');
const emailConfig = require('../config/email');
const logger = require('../utils/logger');

/**
 * Create email transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: emailConfig.secure,
    auth: emailConfig.auth
  });
};

/**
 * Send email
 * @param {Object} options - Email options
 * @param {String} options.to - Recipient email
 * @param {String} options.subject - Email subject
 * @param {String} options.html - HTML content
 * @param {String} options.text - Plain text content
 * @param {Array} options.attachments - Attachments
 */
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `${emailConfig.from.name} <${emailConfig.from.email}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments || []
    };

    const info = await transporter.sendMail(mailOptions);

    logger.info(`Email sent successfully to ${options.to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send email to ${options.to}: ${error.message}`);
    throw error;
  }
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (email, resetToken, userName) => {
  const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

  const html = `
    <h2>Password Reset Request</h2>
    <p>Hello ${userName},</p>
    <p>You requested to reset your password for your HRMS account.</p>
    <p>Please click the link below to reset your password:</p>
    <p><a href="${resetUrl}" style="background-color: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
    <p>This link will expire in 1 hour.</p>
    <p>If you did not request this, please ignore this email.</p>
    <br>
    <p>Best regards,<br>HRMS Team</p>
  `;

  return await sendEmail({
    to: email,
    subject: emailConfig.templates.resetPassword.subject,
    html
  });
};

/**
 * Send payslip notification email
 */
const sendPayslipNotification = async (email, employeeName, month, year, payslipUrl) => {
  const html = `
    <h2>Payslip Available</h2>
    <p>Dear ${employeeName},</p>
    <p>Your payslip for <strong>${month} ${year}</strong> is now available.</p>
    <p>You can view and download your payslip by logging into the HRMS portal.</p>
    <p><a href="${process.env.FRONTEND_URL}/payslip" style="background-color: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Payslip</a></p>
    <br>
    <p>Best regards,<br>HR Department</p>
  `;

  return await sendEmail({
    to: email,
    subject: `Payslip for ${month} ${year}`,
    html
  });
};

/**
 * Send leave status notification email
 */
const sendLeaveStatusNotification = async (email, employeeName, leaveType, status, remarks) => {
  const statusColor = status === 'Approved' ? '#28a745' : '#dc3545';

  const html = `
    <h2>Leave Request ${status}</h2>
    <p>Dear ${employeeName},</p>
    <p>Your <strong>${leaveType}</strong> request has been <span style="color: ${statusColor}; font-weight: bold;">${status}</span>.</p>
    ${remarks ? `<p><strong>Remarks:</strong> ${remarks}</p>` : ''}
    <p>You can view details in the HRMS portal.</p>
    <br>
    <p>Best regards,<br>HR Department</p>
  `;

  return await sendEmail({
    to: email,
    subject: `Leave Request ${status}`,
    html
  });
};

/**
 * Send welcome email to new employee
 */
const sendWelcomeEmail = async (email, employeeName, employeeId, tempPassword) => {
  const loginUrl = `${process.env.FRONTEND_URL}/auth/login`;

  const html = `
    <h2>Welcome to the Team!</h2>
    <p>Dear ${employeeName},</p>
    <p>Welcome to our organization! Your HRMS account has been created.</p>
    <p><strong>Your login credentials:</strong></p>
    <ul>
      <li>Employee ID: ${employeeId}</li>
      <li>Email: ${email}</li>
      <li>Temporary Password: ${tempPassword}</li>
    </ul>
    <p><strong>Important:</strong> Please change your password after your first login.</p>
    <p><a href="${loginUrl}" style="background-color: #0066cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Login to HRMS</a></p>
    <br>
    <p>Best regards,<br>HR Department</p>
  `;

  return await sendEmail({
    to: email,
    subject: 'Welcome to HRMS - Your Account Details',
    html
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendPayslipNotification,
  sendLeaveStatusNotification,
  sendWelcomeEmail
};
