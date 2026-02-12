const analyticsService = require('../services/analyticsService');
const excelExportService = require('../services/excelExportService');
const reportGeneratorService = require('../services/reportGeneratorService');
const logger = require('../utils/logger');

/**
 * Get payroll cost analytics
 */
exports.getPayrollCostAnalytics = async (req, res, next) => {
  try {
    const { year, start_month = 1, end_month = 12 } = req.query;

    if (!year) {
      return res.status(400).json({
        success: false,
        message: 'Year is required'
      });
    }

    const data = await analyticsService.getPayrollCostAnalytics(
      req.user.company_id,
      parseInt(year),
      parseInt(start_month),
      parseInt(end_month)
    );

    logger.info(`Payroll cost analytics retrieved for ${year}`, {
      user_id: req.user.id,
      year,
      period: { start_month, end_month }
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching payroll cost analytics:', error);
    next(error);
  }
};

/**
 * Get leave utilization analytics
 */
exports.getLeaveUtilizationAnalytics = async (req, res, next) => {
  try {
    const { year } = req.query;

    if (!year) {
      return res.status(400).json({
        success: false,
        message: 'Year is required'
      });
    }

    const data = await analyticsService.getLeaveUtilizationAnalytics(req.user.company_id, parseInt(year));

    logger.info(`Leave utilization analytics retrieved for ${year}`, {
      user_id: req.user.id,
      year
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching leave utilization analytics:', error);
    next(error);
  }
};

/**
 * Get attendance punctuality analytics
 */
exports.getAttendancePunctualityAnalytics = async (req, res, next) => {
  try {
    const { year, month } = req.query;

    if (!year) {
      return res.status(400).json({
        success: false,
        message: 'Year is required'
      });
    }

    const data = await analyticsService.getAttendancePunctualityAnalytics(
      req.user.company_id,
      parseInt(year),
      month ? parseInt(month) : null
    );

    logger.info(`Attendance punctuality analytics retrieved for ${year}${month ? `/${month}` : ''}`, {
      user_id: req.user.id,
      year,
      month
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching attendance punctuality analytics:', error);
    next(error);
  }
};

/**
 * Get claims spending analytics
 */
exports.getClaimsSpendingAnalytics = async (req, res, next) => {
  try {
    const { year } = req.query;

    if (!year) {
      return res.status(400).json({
        success: false,
        message: 'Year is required'
      });
    }

    const data = await analyticsService.getClaimsSpendingAnalytics(req.user.company_id, parseInt(year));

    logger.info(`Claims spending analytics retrieved for ${year}`, {
      user_id: req.user.id,
      year
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching claims spending analytics:', error);
    next(error);
  }
};

/**
 * Get dashboard summary
 */
exports.getDashboardSummary = async (req, res, next) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month are required'
      });
    }

    const data = await analyticsService.getDashboardSummary(req.user.company_id, parseInt(year), parseInt(month));

    logger.info(`Dashboard summary retrieved for ${year}/${month}`, {
      user_id: req.user.id,
      year,
      month
    });

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Error fetching dashboard summary:', error);
    next(error);
  }
};

/**
 * Export analytics data as Excel
 */
exports.exportAnalyticsExcel = async (req, res, next) => {
  try {
    const { type, year, month } = req.query;

    if (!type || !year) {
      return res.status(400).json({
        success: false,
        message: 'Type and year are required'
      });
    }

    const validTypes = ['payroll', 'leave', 'attendance', 'claims'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const companyId = req.user.company_id;
    let data;
    let filename;

    switch (type) {
      case 'payroll':
        data = await analyticsService.getPayrollCostAnalytics(companyId, parseInt(year));
        filename = `Payroll_Analytics_${year}.xlsx`;
        break;
      case 'leave':
        data = await analyticsService.getLeaveUtilizationAnalytics(companyId, parseInt(year));
        filename = `Leave_Analytics_${year}.xlsx`;
        break;
      case 'attendance':
        data = await analyticsService.getAttendancePunctualityAnalytics(
          companyId,
          parseInt(year),
          month ? parseInt(month) : null
        );
        filename = month
          ? `Attendance_Analytics_${year}_${String(month).padStart(2, '0')}.xlsx`
          : `Attendance_Analytics_${year}.xlsx`;
        break;
      case 'claims':
        data = await analyticsService.getClaimsSpendingAnalytics(companyId, parseInt(year));
        filename = `Claims_Analytics_${year}.xlsx`;
        break;
    }

    const buffer = await excelExportService.generateAnalyticsExcel(type, data);

    logger.info(`Analytics Excel exported: ${filename}`, {
      user_id: req.user.id,
      type,
      year,
      month
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    logger.error('Error exporting analytics Excel:', error);
    next(error);
  }
};

/**
 * Export analytics data as PDF
 */
exports.exportAnalyticsPDF = async (req, res, next) => {
  try {
    const { type, year, month } = req.query;

    if (!type || !year) {
      return res.status(400).json({
        success: false,
        message: 'Type and year are required'
      });
    }

    const validTypes = ['payroll', 'leave', 'attendance', 'claims'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const companyId = req.user.company_id;
    let data;
    let filename;

    switch (type) {
      case 'payroll':
        data = await analyticsService.getPayrollCostAnalytics(companyId, parseInt(year));
        filename = `Payroll_Analytics_${year}.pdf`;
        break;
      case 'leave':
        data = await analyticsService.getLeaveUtilizationAnalytics(companyId, parseInt(year));
        filename = `Leave_Analytics_${year}.pdf`;
        break;
      case 'attendance':
        data = await analyticsService.getAttendancePunctualityAnalytics(
          companyId,
          parseInt(year),
          month ? parseInt(month) : null
        );
        filename = month
          ? `Attendance_Analytics_${year}_${String(month).padStart(2, '0')}.pdf`
          : `Attendance_Analytics_${year}.pdf`;
        break;
      case 'claims':
        data = await analyticsService.getClaimsSpendingAnalytics(companyId, parseInt(year));
        filename = `Claims_Analytics_${year}.pdf`;
        break;
    }

    const pdfBuffer = await reportGeneratorService.generateAnalyticsReport(type, data);

    logger.info(`Analytics PDF exported: ${filename}`, {
      user_id: req.user.id,
      type,
      year,
      month
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error exporting analytics PDF:', error);
    next(error);
  }
};
