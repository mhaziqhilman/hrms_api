const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireManager } = require('../middleware/rbac.middleware');

router.get('/pnl', verifyToken, requireManager, financeController.getPnl);
router.get('/sales', verifyToken, requireManager, financeController.getSales);
router.get('/expenses', verifyToken, requireManager, financeController.getExpenses);
router.get('/projects-pnl', verifyToken, requireManager, financeController.getProjectsPnl);

module.exports = router;
