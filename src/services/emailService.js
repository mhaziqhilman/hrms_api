const nodemailer = require('nodemailer');
const emailConfig = require('../config/email');
const logger = require('../utils/logger');

/**
 * Check user notification preferences before sending automatic emails
 * @param {Number} userId - User ID
 * @param {String} notificationType - One of: leave_status, claim_status, payslip, memo, policy
 * @returns {Boolean} true if email should be sent
 */
const shouldSendEmail = async (userId, notificationType) => {
  try {
    const { UserSettings } = require('../models');
    const settings = await UserSettings.findOne({ where: { user_id: userId } });
    if (!settings) return true; // Default to sending if no settings found

    // Master toggle
    if (!settings.email_notifications) return false;

    // Per-type preferences
    const typeMap = {
      leave_status: 'notify_leave_approval',
      claim_status: 'notify_claim_approval',
      payslip: 'notify_payslip_ready',
      memo: 'notify_memo_received',
      policy: 'notify_policy_update'
    };

    const field = typeMap[notificationType];
    if (field && settings[field] === false) return false;

    return true;
  } catch (error) {
    logger.error(`Error checking email preferences for user ${userId}: ${error.message}`);
    return true; // Default to sending on error
  }
};

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
 * Get company name from DB
 */
const getCompanyName = async (companyId) => {
  try {
    if (!companyId) return 'HRMS';
    const { Company } = require('../models');
    const company = await Company.findByPk(companyId, { attributes: ['name'] });
    return company?.name || 'HRMS';
  } catch {
    return 'HRMS';
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
 * Create default email transporter (from env vars)
 */
const createDefaultTransporter = () => {
  return nodemailer.createTransport({
    host: emailConfig.host,
    port: emailConfig.port,
    secure: emailConfig.secure,
    auth: emailConfig.auth
  });
};

/**
 * Get company-specific transporter or fall back to default
 * @param {Number} companyId - Company ID
 * @returns {{ transporter, fromName, fromEmail }}
 */
const getCompanyTransporter = async (companyId) => {
  try {
    if (companyId) {
      const { EmailConfiguration } = require('../models');
      const { decrypt } = require('../utils/encryption');
      const config = await EmailConfiguration.findOne({
        where: { company_id: companyId, is_active: true }
      });

      if (config) {
        const password = decrypt(config.smtp_password);
        const transporter = nodemailer.createTransport({
          host: config.smtp_host,
          port: config.smtp_port,
          secure: config.smtp_secure,
          auth: { user: config.smtp_user, pass: password }
        });
        return {
          transporter,
          fromName: config.from_name || emailConfig.from.name,
          fromEmail: config.from_email || config.smtp_user
        };
      }
    }
  } catch (error) {
    logger.error(`Failed to get company transporter for company ${companyId}: ${error.message}`);
  }

  // Fall back to default
  return {
    transporter: createDefaultTransporter(),
    fromName: emailConfig.from.name,
    fromEmail: emailConfig.from.email
  };
};

/**
 * Send email
 * @param {Object} options - Email options
 * @param {String} options.to - Recipient email
 * @param {String} options.subject - Email subject
 * @param {String} options.html - HTML content
 * @param {String} options.text - Plain text content
 * @param {Array} options.attachments - Attachments
 * @param {Number} options.companyId - Company ID for company-specific SMTP
 */
const sendEmail = async (options) => {
  try {
    const { transporter, fromName, fromEmail } = await getCompanyTransporter(options.companyId);

    const mailOptions = {
      from: `${fromName} <${fromEmail}>`,
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
    const companyName = await getCompanyName(companyId);
    const vars = { employee_name: userName, reset_link: resetUrl, company_name: companyName };
    return await sendEmail({
      to: email,
      subject: replaceVariables(dbTemplate.subject, vars),
      html: textToHtml(replaceVariables(dbTemplate.body, vars)),
      companyId
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
    html,
    companyId
  });
};

/**
 * Send payslip notification email
 */
const sendPayslipNotification = async (email, employeeName, month, year, payslipUrl, companyId, pdfBuffer = null) => {
  const attachments = pdfBuffer ? [{ filename: `Payslip_${month}_${year}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }] : [];

  const dbTemplate = await getTemplate(companyId, 'payslip');
  if (dbTemplate) {
    const companyName = await getCompanyName(companyId);
    const vars = { employee_name: employeeName, month, year, portal_link: `${process.env.FRONTEND_URL}/payslip`, company_name: companyName };
    return await sendEmail({
      to: email,
      subject: replaceVariables(dbTemplate.subject, vars),
      html: textToHtml(replaceVariables(dbTemplate.body, vars)),
      attachments,
      companyId
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
    html,
    attachments,
    companyId
  });
};

/**
 * Send leave status notification email
 */
const sendLeaveStatusNotification = async (email, employeeName, leaveType, status, remarks, companyId) => {
  const dbTemplate = await getTemplate(companyId, 'leave_status');
  if (dbTemplate) {
    const companyName = await getCompanyName(companyId);
    const vars = { employee_name: employeeName, leave_type: leaveType, status, remarks: remarks || '', company_name: companyName };
    return await sendEmail({
      to: email,
      subject: replaceVariables(dbTemplate.subject, vars),
      html: textToHtml(replaceVariables(dbTemplate.body, vars)),
      companyId
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
    html,
    companyId
  });
};

/**
 * Send welcome email to new employee
 */
const sendWelcomeEmail = async (email, employeeName, employeeId, tempPassword, companyId) => {
  const loginUrl = `${process.env.FRONTEND_URL}/auth/login`;

  const credentialsSection = tempPassword
    ? `<p><strong>Your login credentials:</strong></p>
       <ul>
         <li>Employee ID: ${employeeId || 'N/A'}</li>
         <li>Email: ${email}</li>
         <li>Temporary Password: ${tempPassword}</li>
       </ul>
       <p><strong>Important:</strong> Please change your password after your first login.</p>`
    : `<p>You can now access the HRMS portal using your existing account credentials.</p>`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">Welcome to the Team!</h2>
      <p>Dear ${employeeName},</p>
      <p>Welcome to our organization! You have successfully joined on Nextura HRMS.</p>
      ${credentialsSection}
      <p style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}" style="background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Login to HRMS</a>
      </p>
      <br>
      <p>Best regards,<br>Nextura HRMS Team</p>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: 'Welcome to Nextura HRMS',
    html,
    companyId
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
const sendInvitationEmail = async (email, inviterName, companyName, invitationToken, companyId) => {
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
    html,
    companyId
  });
};

/**
 * Send claim status notification email
 */
const sendClaimStatusNotification = async (email, employeeName, claimAmount, status, remarks, companyId) => {
  const dbTemplate = await getTemplate(companyId, 'claim_status');
  if (dbTemplate) {
    const companyName = await getCompanyName(companyId);
    const vars = { employee_name: employeeName, claim_amount: `RM${claimAmount}`, status, remarks: remarks || '', company_name: companyName };
    return await sendEmail({
      to: email,
      subject: replaceVariables(dbTemplate.subject, vars),
      html: textToHtml(replaceVariables(dbTemplate.body, vars)),
      companyId
    });
  }

  const statusColor = status.includes('Rejected') ? '#dc3545' : '#28a745';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Claim ${status}</h2>
      <p>Dear ${employeeName},</p>
      <p>Your claim of <strong>RM${claimAmount}</strong> has been <span style="color: ${statusColor}; font-weight: bold;">${status}</span>.</p>
      ${remarks ? `<p><strong>Remarks:</strong> ${remarks}</p>` : ''}
      <p>You can view details in the HRMS portal.</p>
      <br>
      <p>Best regards,<br>HR Department</p>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: `Claim ${status}`,
    html,
    companyId
  });
};

/**
 * Send EA Form notification email with PDF attachment
 */
const sendEAFormNotification = async (email, employeeName, year, pdfBuffer, companyId) => {
  const attachments = [{ filename: `EA_Form_${year}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }];

  const dbTemplate = await getTemplate(companyId, 'ea_form');
  if (dbTemplate) {
    const companyName = await getCompanyName(companyId);
    const vars = { employee_name: employeeName, year: String(year), company_name: companyName };
    return await sendEmail({
      to: email,
      subject: replaceVariables(dbTemplate.subject, vars),
      html: textToHtml(replaceVariables(dbTemplate.body, vars)),
      attachments,
      companyId
    });
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">EA Form ${year}</h2>
      <p>Dear ${employeeName},</p>
      <p>Please find attached your EA Form (Borang EA) for the year <strong>${year}</strong>.</p>
      <p>This document is your Statement of Remuneration from Employment for tax filing purposes.</p>
      <p>If you have any questions, please contact your HR department.</p>
      <br>
      <p>Best regards,<br>Nextura HRMS Team</p>
    </div>
  `;

  return await sendEmail({
    to: email,
    subject: `EA Form ${year} - Statement of Remuneration`,
    html,
    attachments,
    companyId
  });
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendPayslipNotification,
  sendLeaveStatusNotification,
  sendClaimStatusNotification,
  sendEAFormNotification,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendInvitationEmail,
  shouldSendEmail,
  getTemplate,
  replaceVariables,
  textToHtml
};
