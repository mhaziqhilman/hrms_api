const { EmailTemplate } = require('../models');
const logger = require('../utils/logger');

// Default email templates with variables
const DEFAULT_TEMPLATES = {
  password_reset: {
    subject: 'Password Reset Request',
    body: 'Hello {{employee_name}},\n\nYou requested to reset your password for your HRMS account.\n\nPlease click the link below to reset your password:\n{{reset_link}}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, please ignore this email.\n\nBest regards,\n{{company_name}} HR Team',
    variables: ['employee_name', 'reset_link', 'company_name']
  },
  payslip: {
    subject: 'Payslip for {{month}} {{year}}',
    body: 'Dear {{employee_name}},\n\nYour payslip for {{month}} {{year}} is now available.\n\nYou can view and download your payslip by logging into the HRMS portal.\n\n{{portal_link}}\n\nBest regards,\n{{company_name}} HR Department',
    variables: ['employee_name', 'month', 'year', 'portal_link', 'company_name']
  },
  leave_status: {
    subject: 'Leave Request {{status}}',
    body: 'Dear {{employee_name}},\n\nYour {{leave_type}} request has been {{status}}.\n\n{{remarks}}\n\nYou can view details in the HRMS portal.\n\nBest regards,\n{{company_name}} HR Department',
    variables: ['employee_name', 'leave_type', 'status', 'remarks', 'company_name']
  },
  welcome: {
    subject: 'Welcome to {{company_name}} - Your Account Details',
    body: 'Dear {{employee_name}},\n\nWelcome to our organization! Your HRMS account has been created.\n\nYour login credentials:\n- Employee ID: {{employee_id}}\n- Email: {{email}}\n- Temporary Password: {{temp_password}}\n\nImportant: Please change your password after your first login.\n\n{{login_link}}\n\nBest regards,\n{{company_name}} HR Department',
    variables: ['employee_name', 'employee_id', 'email', 'temp_password', 'login_link', 'company_name']
  },
  verification: {
    subject: 'Verify Your Email - {{company_name}} HRMS',
    body: 'Hello {{employee_name}},\n\nThank you for registering with {{company_name}} HRMS. Please verify your email address by clicking the link below:\n\n{{verify_link}}\n\nThis link will expire in 24 hours.\n\nIf you did not create an account, please ignore this email.\n\nBest regards,\n{{company_name}} HRMS Team',
    variables: ['employee_name', 'verify_link', 'company_name']
  },
  invitation: {
    subject: "You've been invited to join {{company_name}}",
    body: 'Hello,\n\n{{inviter_name}} has invited you to join {{company_name}} on HRMS.\n\nClick the link below to accept the invitation and get started:\n\n{{invite_link}}\n\nThis invitation will expire in 7 days.\n\nBest regards,\n{{company_name}} HRMS Team',
    variables: ['inviter_name', 'company_name', 'invite_link']
  }
};

/**
 * Get all email templates for the user's company
 * Seeds defaults if none exist
 */
exports.getAllTemplates = async (req, res) => {
  try {
    const { company_id } = req.user;

    let templates = await EmailTemplate.findAll({
      where: { company_id },
      order: [['template_key', 'ASC']]
    });

    // Seed defaults if no templates exist
    if (templates.length === 0) {
      const seedData = Object.entries(DEFAULT_TEMPLATES).map(([key, tmpl]) => ({
        company_id,
        template_key: key,
        subject: tmpl.subject,
        body: tmpl.body,
        variables: tmpl.variables,
        is_active: true
      }));
      await EmailTemplate.bulkCreate(seedData);
      templates = await EmailTemplate.findAll({
        where: { company_id },
        order: [['template_key', 'ASC']]
      });
    }

    res.json({ success: true, data: templates });
  } catch (error) {
    logger.error('Error fetching email templates:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch email templates' });
  }
};

/**
 * Get a single email template by key
 */
exports.getTemplate = async (req, res) => {
  try {
    const { key } = req.params;
    const { company_id } = req.user;

    let template = await EmailTemplate.findOne({ where: { company_id, template_key: key } });

    if (!template && DEFAULT_TEMPLATES[key]) {
      template = await EmailTemplate.create({
        company_id,
        template_key: key,
        subject: DEFAULT_TEMPLATES[key].subject,
        body: DEFAULT_TEMPLATES[key].body,
        variables: DEFAULT_TEMPLATES[key].variables,
        is_active: true
      });
    }

    if (!template) {
      return res.status(404).json({ success: false, message: 'Email template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    logger.error('Error fetching email template:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch email template' });
  }
};

/**
 * Update an email template
 */
exports.updateTemplate = async (req, res) => {
  try {
    const { key } = req.params;
    const { company_id } = req.user;
    const { subject, body, is_active } = req.body;

    let template = await EmailTemplate.findOne({ where: { company_id, template_key: key } });
    if (!template) {
      return res.status(404).json({ success: false, message: 'Email template not found' });
    }

    const updateData = {};
    if (subject !== undefined) updateData.subject = subject;
    if (body !== undefined) updateData.body = body;
    if (is_active !== undefined) updateData.is_active = is_active;

    await template.update(updateData);

    logger.info(`Email template updated: ${key} (company: ${company_id})`);
    res.json({ success: true, data: template, message: 'Email template updated successfully' });
  } catch (error) {
    logger.error('Error updating email template:', error);
    res.status(500).json({ success: false, message: 'Failed to update email template' });
  }
};

/**
 * Preview an email template with sample data
 */
exports.previewTemplate = async (req, res) => {
  try {
    const { key } = req.params;
    const { company_id } = req.user;

    const template = await EmailTemplate.findOne({ where: { company_id, template_key: key } });
    if (!template) {
      return res.status(404).json({ success: false, message: 'Email template not found' });
    }

    // Sample data for preview
    const sampleData = {
      employee_name: 'John Doe',
      company_name: 'Acme Corp',
      reset_link: 'https://example.com/reset?token=sample',
      portal_link: 'https://example.com/login',
      verify_link: 'https://example.com/verify?token=sample',
      invite_link: 'https://example.com/invite?token=sample',
      login_link: 'https://example.com/login',
      month: 'January',
      year: '2025',
      leave_type: 'Annual Leave',
      status: 'Approved',
      remarks: 'Enjoy your leave!',
      employee_id: 'EMP001',
      email: 'john@example.com',
      temp_password: 'Temp@1234',
      inviter_name: 'Jane Smith'
    };

    let previewSubject = template.subject;
    let previewBody = template.body;

    for (const [varName, value] of Object.entries(sampleData)) {
      const regex = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
      previewSubject = previewSubject.replace(regex, value);
      previewBody = previewBody.replace(regex, value);
    }

    res.json({
      success: true,
      data: {
        subject: previewSubject,
        body: previewBody
      }
    });
  } catch (error) {
    logger.error('Error previewing email template:', error);
    res.status(500).json({ success: false, message: 'Failed to preview email template' });
  }
};

/**
 * Reset an email template to system default
 */
exports.resetTemplate = async (req, res) => {
  try {
    const { key } = req.params;
    const { company_id } = req.user;

    if (!DEFAULT_TEMPLATES[key]) {
      return res.status(404).json({ success: false, message: 'No default template found for this key' });
    }

    const template = await EmailTemplate.findOne({ where: { company_id, template_key: key } });
    if (!template) {
      return res.status(404).json({ success: false, message: 'Email template not found' });
    }

    await template.update({
      subject: DEFAULT_TEMPLATES[key].subject,
      body: DEFAULT_TEMPLATES[key].body,
      variables: DEFAULT_TEMPLATES[key].variables,
      is_active: true
    });

    logger.info(`Email template reset to default: ${key} (company: ${company_id})`);
    res.json({ success: true, data: template, message: 'Email template reset to default successfully' });
  } catch (error) {
    logger.error('Error resetting email template:', error);
    res.status(500).json({ success: false, message: 'Failed to reset email template' });
  }
};

module.exports = {
  ...exports,
  DEFAULT_TEMPLATES
};
