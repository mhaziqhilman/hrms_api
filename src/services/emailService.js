const nodemailer = require('nodemailer');
const emailConfig = require('../config/email');
const logger = require('../utils/logger');

/**
 * Get email template from DB with fallback to hardcoded defaults
 */
const getTemplate = async (companyId, templateKey) => {
  try {
    if (!companyId) return null;
    const { EmailTemplate } = require('../models');
    const template = await EmailTemplate.findOne({
      where: { company_id: companyId, template_key: templateKey, is_active: true }
    });
    return template;
  } catch {
    return null;
  }
};

/**
 * Replace {{variable}} placeholders in a template string
 */
const replaceVariables = (text, variables) => {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  return result;
};

/**
 * Convert plain text template body to HTML
 */
const textToHtml = (text) => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="background-color: #10b981; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Click Here</a>');
};

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
const sendPasswordResetEmail = async (email, resetToken, userName, companyId) => {
  const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

  const dbTemplate = await getTemplate(companyId, 'password_reset');
  if (dbTemplate) {
    const vars = { employee_name: userName, reset_link: resetUrl, company_name: 'HRMS' };
    return await sendEmail({
      to: email,
      subject: replaceVariables(dbTemplate.subject, vars),
      html: textToHtml(replaceVariables(dbTemplate.body, vars))
    });
  }

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
const sendPayslipNotification = async (email, employeeName, month, year, payslipUrl, companyId) => {
  const dbTemplate = await getTemplate(companyId, 'payslip');
  if (dbTemplate) {
    const vars = { employee_name: employeeName, month, year, portal_link: `${process.env.FRONTEND_URL}/payslip`, company_name: 'HRMS' };
    return await sendEmail({
      to: email,
      subject: replaceVariables(dbTemplate.subject, vars),
      html: textToHtml(replaceVariables(dbTemplate.body, vars))
    });
  }

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
const sendLeaveStatusNotification = async (email, employeeName, leaveType, status, remarks, companyId) => {
  const dbTemplate = await getTemplate(companyId, 'leave_status');
  if (dbTemplate) {
    const vars = { employee_name: employeeName, leave_type: leaveType, status, remarks: remarks || '', company_name: 'HRMS' };
    return await sendEmail({
      to: email,
      subject: replaceVariables(dbTemplate.subject, vars),
      html: textToHtml(replaceVariables(dbTemplate.body, vars))
    });
  }

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

/**
 * Send email verification email
 */
const sendVerificationEmail = async (email, verificationToken, userName) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/auth/verify-email?token=${verificationToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">Verify Your Email Address</h2>
      <p>Hello ${userName},</p>
      <p>Thank you for registering with Nextura HRMS. Please verify your email address by clicking the button below:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Verify Email</a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #6b7280; font-size: 14px;">${verifyUrl}</p>
      <p>This link will expire in 24 hours.</p>
      <p>If you did not create an account, please ignore this email.</p>
      <br>
      <p>Best regards,<br>Nextura HRMS Team</p>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: 'Verify Your Email - Nextura HRMS',
    html
  });
};

/**
 * Send invitation email
 */
const sendInvitationEmail = async (email, inviterName, companyName, invitationToken) => {
  const inviteUrl = `${process.env.FRONTEND_URL}/auth/accept-invitation?token=${invitationToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">You've Been Invited!</h2>
      <p>Hello,</p>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on Nextura HRMS.</p>
      <p>Click the button below to accept the invitation and get started:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${inviteUrl}" style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Accept Invitation</a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #6b7280; font-size: 14px;">${inviteUrl}</p>
      <p>This invitation will expire in 7 days.</p>
      <br>
      <p>Best regards,<br>Nextura HRMS Team</p>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: `You've been invited to join ${companyName} - Nextura HRMS`,
    html
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendPayslipNotification,
  sendLeaveStatusNotification,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendInvitationEmail,
  getTemplate,
  replaceVariables,
  textToHtml
};
