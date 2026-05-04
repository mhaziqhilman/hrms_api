const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin, requireManager } = require('../middleware/rbac.middleware');
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }
  next();
};

const createValidation = [
  body('code').notEmpty().withMessage('Project code is required'),
  body('name').notEmpty().withMessage('Project name is required'),
  body('status').optional().isIn(['Planning', 'Active', 'On_Hold', 'Completed', 'Cancelled']),
  body('budget').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('po_value').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('po_duration_months').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 })
];

router.get('/', verifyToken, projectController.getAllProjects);
router.post('/', verifyToken, requireManager, createValidation, validate, projectController.createProject);
router.get('/:id', verifyToken, projectController.getProjectById);
router.put('/:id', verifyToken, requireManager, projectController.updateProject);
router.delete('/:id', verifyToken, requireAdmin, projectController.deleteProject);
router.get('/:id/transactions', verifyToken, projectController.getProjectTransactions);

module.exports = router;
