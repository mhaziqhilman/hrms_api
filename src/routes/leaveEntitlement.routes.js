const express = require('express');
const { body, param, query } = require('express-validator');
const leaveEntitlementController = require('../controllers/leaveEntitlementController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

// Validation rules
const listValidation = [
  query('year').optional().isInt({ min: 2020, max: 2100 }).withMessage('Year must be between 2020 and 2100'),
  query('employee_id').optional().isInt().withMessage('Employee ID must be an integer'),
  query('leave_type_id').optional().isInt().withMessage('Leave type ID must be an integer'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string')
];

const createValidation = [
  body('employee_id').isInt().withMessage('Employee ID must be an integer'),
  body('leave_type_id').isInt().withMessage('Leave type ID must be an integer'),
  body('year').isInt({ min: 2020, max: 2100 }).withMessage('Year must be between 2020 and 2100'),
  body('total_days').isFloat({ min: 0 }).withMessage('Total days must be a non-negative number'),
  body('carry_forward_days').optional().isFloat({ min: 0 }).withMessage('Carry forward days must be a non-negative number')
];

const updateValidation = [
  param('id').isInt().withMessage('ID must be an integer'),
  body('total_days').optional().isFloat({ min: 0 }).withMessage('Total days must be a non-negative number'),
  body('carry_forward_days').optional().isFloat({ min: 0 }).withMessage('Carry forward days must be a non-negative number')
];

const idParamValidation = [
  param('id').isInt().withMessage('ID must be an integer')
];

const initializeValidation = [
  body('year').isInt({ min: 2020, max: 2100 }).withMessage('Year must be between 2020 and 2100')
];

// Routes - all require admin role
router.get('/', verifyToken, requireAdmin, listValidation, validate, leaveEntitlementController.getAllEntitlements);
router.post('/initialize', verifyToken, requireAdmin, initializeValidation, validate, leaveEntitlementController.initializeYear);
router.post('/', verifyToken, requireAdmin, createValidation, validate, leaveEntitlementController.createEntitlement);
router.get('/:id', verifyToken, requireAdmin, idParamValidation, validate, leaveEntitlementController.getEntitlement);
router.put('/:id', verifyToken, requireAdmin, updateValidation, validate, leaveEntitlementController.updateEntitlement);
router.delete('/:id', verifyToken, requireAdmin, idParamValidation, validate, leaveEntitlementController.deleteEntitlement);

module.exports = router;
