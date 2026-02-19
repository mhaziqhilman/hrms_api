const express = require('express');
const router = express.Router();
const statutoryReportsController = require('../controllers/statutoryReportsController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');

// All routes require authentication
router.use(verifyToken);

// Only Admin and Super Admin can access statutory reports
const adminAccess = requireRole(['super_admin', 'admin']);

/**
 * @route   GET /api/statutory-reports/periods
 * @desc    Get available report periods (years/months with payroll data)
 * @access  Admin, Super Admin
 */
router.get('/periods', adminAccess, statutoryReportsController.getAvailablePeriods);

/**
 * EA Form Routes (Annual)
 */

/**
 * @route   GET /api/statutory-reports/ea/:year/employees
 * @desc    Get employees list for EA form selection
 * @access  Admin, Super Admin
 */
router.get('/ea/:year/employees', adminAccess, statutoryReportsController.getEmployeesForEA);

/**
 * @route   GET /api/statutory-reports/ea/:employee_id/:year
 * @desc    Get EA Form data for an employee
 * @access  Admin, Super Admin
 */
router.get('/ea/:employee_id/:year', adminAccess, statutoryReportsController.getEAForm);

/**
 * @route   GET /api/statutory-reports/ea/:employee_id/:year/pdf
 * @desc    Download EA Form as PDF
 * @access  Admin, Super Admin
 */
router.get('/ea/:employee_id/:year/pdf', adminAccess, statutoryReportsController.downloadEAFormPDF);

/**
 * @route   GET /api/statutory-reports/ea/:employee_id/:year/excel
 * @desc    Download EA Form as Excel (LHDN C.P.8A template)
 * @access  Admin, Super Admin
 */
router.get('/ea/:employee_id/:year/excel', adminAccess, statutoryReportsController.downloadEAFormExcel);

/**
 * EPF Borang A Routes (Monthly)
 */

/**
 * @route   GET /api/statutory-reports/epf/:year/:month
 * @desc    Get EPF Borang A data
 * @access  Admin, Super Admin
 */
router.get('/epf/:year/:month', adminAccess, statutoryReportsController.getEPFBorangA);

/**
 * @route   GET /api/statutory-reports/epf/:year/:month/pdf
 * @desc    Download EPF Borang A as PDF
 * @access  Admin, Super Admin
 */
router.get('/epf/:year/:month/pdf', adminAccess, statutoryReportsController.downloadEPFBorangAPDF);

/**
 * SOCSO Form 8A Routes (Monthly)
 */

/**
 * @route   GET /api/statutory-reports/socso/:year/:month
 * @desc    Get SOCSO Form 8A data
 * @access  Admin, Super Admin
 */
router.get('/socso/:year/:month', adminAccess, statutoryReportsController.getSOCSOForm8A);

/**
 * @route   GET /api/statutory-reports/socso/:year/:month/pdf
 * @desc    Download SOCSO Form 8A as PDF
 * @access  Admin, Super Admin
 */
router.get('/socso/:year/:month/pdf', adminAccess, statutoryReportsController.downloadSOCSOForm8APDF);

/**
 * PCB CP39 Routes (Monthly)
 */

/**
 * @route   GET /api/statutory-reports/pcb/:year/:month
 * @desc    Get PCB CP39 data
 * @access  Admin, Super Admin
 */
router.get('/pcb/:year/:month', adminAccess, statutoryReportsController.getPCBCP39);

/**
 * @route   GET /api/statutory-reports/pcb/:year/:month/pdf
 * @desc    Download PCB CP39 as PDF
 * @access  Admin, Super Admin
 */
router.get('/pcb/:year/:month/pdf', adminAccess, statutoryReportsController.downloadPCBCP39PDF);

/**
 * CSV Export Routes (e-filing format)
 */

/**
 * @route   GET /api/statutory-reports/csv/:type/:year/:month
 * @desc    Download report as CSV (epf, socso, pcb)
 * @access  Admin, Super Admin
 */
router.get('/csv/:type/:year/:month', adminAccess, statutoryReportsController.downloadCSV);

module.exports = router;
