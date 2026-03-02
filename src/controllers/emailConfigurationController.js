const { EmailConfiguration } = require('../models');
const { encrypt, decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');
const nodemailer = require('nodemailer');

/**
 * Get email configuration for the current company
 */
exports.getConfig = async (req, res) => {
  try {
    const { company_id } = req.user;

    const config = await EmailConfiguration.findOne({ where: { company_id } });

    if (!config) {
      return res.json({
        success: true,
        data: null,
        message: 'No email configuration found. System default will be used.'
      });
    }

    // Return config without the actual password
    const data = config.toJSON();
    data.has_password = !!data.smtp_password;
    delete data.smtp_password;

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching email configuration:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch email configuration' });
  }
};

/**
 * Create or update email configuration
 */
exports.updateConfig = async (req, res) => {
  try {
    const { company_id } = req.user;
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, from_name, from_email, is_active } = req.body;

    let config = await EmailConfiguration.findOne({ where: { company_id } });

    const updateData = {
      smtp_host,
      smtp_port: parseInt(smtp_port) || 587,
      smtp_secure: !!smtp_secure,
      smtp_user,
      from_name: from_name || '',
      from_email: from_email || '',
      is_active: is_active !== undefined ? !!is_active : false
    };

    // Only update password if a new one is provided
    if (smtp_password) {
      updateData.smtp_password = encrypt(smtp_password);
    }

    if (config) {
      // If no new password provided, keep the existing one
      if (!smtp_password) {
        delete updateData.smtp_password;
      }
      await config.update(updateData);
    } else {
      if (!smtp_password) {
        return res.status(400).json({ success: false, message: 'SMTP password is required for new configuration' });
      }
      config = await EmailConfiguration.create({ ...updateData, company_id });
    }

    logger.info(`Email configuration updated for company ${company_id}`);

    // Return without password
    const data = config.toJSON();
    data.has_password = !!data.smtp_password;
    delete data.smtp_password;

    res.json({ success: true, data, message: 'Email configuration saved successfully' });
  } catch (error) {
    logger.error('Error updating email configuration:', error);
    res.status(500).json({ success: false, message: 'Failed to update email configuration' });
  }
};

/**
 * Test email configuration by sending a test email
 */
exports.testConnection = async (req, res) => {
  try {
    const { company_id } = req.user;

    const config = await EmailConfiguration.findOne({ where: { company_id } });
    if (!config) {
      return res.status(404).json({ success: false, message: 'No email configuration found. Please save your settings first.' });
    }

    // Decrypt password and create transporter
    const password = decrypt(config.smtp_password);

    logger.info(`Testing SMTP connection: host=${config.smtp_host}, port=${config.smtp_port}, secure=${config.smtp_secure}, user=${config.smtp_user}`);

    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
      auth: {
        user: config.smtp_user,
        pass: password
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: false
      }
    });

    // Verify connection
    await transporter.verify();

    // Send test email to the current user
    const userEmail = req.user.email;
    const fromName = config.from_name || 'HRMS System';
    const fromEmail = config.from_email || config.smtp_user;

    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: userEmail,
      subject: 'HRMS - Email Configuration Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Email Configuration Test Successful</h2>
          <p>This is a test email from your HRMS system.</p>
          <p>Your email configuration is working correctly.</p>
          <br>
          <p style="color: #6b7280; font-size: 14px;">SMTP Host: ${config.smtp_host}<br>SMTP Port: ${config.smtp_port}</p>
        </div>
      `
    });

    logger.info(`Test email sent successfully for company ${company_id} to ${userEmail}`);
    res.json({ success: true, message: `Test email sent successfully to ${userEmail}` });
  } catch (error) {
    logger.error('Email configuration test failed:', error);
    let message;
    if (error.code === 'EAUTH') {
      message = 'Authentication failed. Please check your username and password.';
    } else if (error.code === 'ESOCKET' || error.code === 'ECONNREFUSED') {
      message = 'Connection failed. Please check your SMTP host and port. If using port 465, enable SSL/TLS. If using port 587, disable SSL/TLS.';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNECTION') {
      message = 'Connection timed out. The SMTP server may be unreachable or the port may be blocked by your hosting provider.';
    } else {
      message = `Test failed: ${error.message}`;
    }
    res.status(400).json({ success: false, message });
  }
};
