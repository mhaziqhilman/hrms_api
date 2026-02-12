require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const { testConnection, sequelize } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/error.middleware');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const payrollRoutes = require('./routes/payroll.routes');
const leaveRoutes = require('./routes/leave.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const claimRoutes = require('./routes/claim.routes');
const claimTypeRoutes = require('./routes/claimType.routes');
const fileRoutes = require('./routes/file.routes');
const memoRoutes = require('./routes/memo.routes');
const policyRoutes = require('./routes/policy.routes');
const statutoryReportsRoutes = require('./routes/statutory-reports.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const userManagementRoutes = require('./routes/userManagement.routes');
const settingsRoutes = require('./routes/settings.routes');
const companyRoutes = require('./routes/company.routes');
const invitationRoutes = require('./routes/invitation.routes');
const leaveTypeRoutes = require('./routes/leaveType.routes');
const publicHolidayRoutes = require('./routes/publicHoliday.routes');
const statutoryConfigRoutes = require('./routes/statutoryConfig.routes');
const emailTemplateRoutes = require('./routes/emailTemplate.routes');

// Initialize express app
const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
  credentials: true
}));

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// HTTP request logger
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// Rate limiting - General API limiter (generous for SPA usage)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10), // 1000 requests per 15 min (SPA fires many calls per page)
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development' && process.env.RATE_LIMIT_ENABLED !== 'true'
});

// Strict rate limit for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login/register attempts per 15 min
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'HRMS API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/claims', claimRoutes);
app.use('/api/claim-types', claimTypeRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/memos', memoRoutes);
app.use('/api/policies', policyRoutes);
app.use('/api/statutory-reports', statutoryReportsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userManagementRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/leave-types', leaveTypeRoutes);
app.use('/api/public-holidays', publicHolidayRoutes);
app.use('/api/statutory-config', statutoryConfigRoutes);
app.use('/api/email-templates', emailTemplateRoutes);

// Placeholder routes for other modules (to be implemented)
// app.use('/api/invoices', invoiceRoutes);

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Server configuration
const PORT = process.env.PORT || 3000;

// Database connection and server startup
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();

    // Sync database models (in development only)
    if (process.env.NODE_ENV === 'development' && process.env.DB_SYNC === 'true') {
      // Sync Company table first to resolve circular FK: users.company_id → companies, companies.owner_id → users
      const { Company, Invitation } = require('./models');
      await Company.sync({ alter: true });
      await Invitation.sync({ alter: true });
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized');
    }

    // Start server
    app.listen(PORT, () => {
      logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   HRMS API Server Started Successfully                   ║
║                                                           ║
║   Port:        ${PORT.toString().padEnd(42)} ║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(42)} ║
║   Time:        ${new Date().toISOString().padEnd(42)} ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await sequelize.close();
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;
