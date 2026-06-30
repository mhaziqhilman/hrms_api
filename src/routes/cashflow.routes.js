const express = require('express');
const router = express.Router();
const cashFlowController = require('../controllers/cashFlowController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireManager } = require('../middleware/rbac.middleware');

router.use(verifyToken, requireManager);

router.get('/', cashFlowController.list);
router.get('/template', cashFlowController.getTemplate);
router.post('/', cashFlowController.create);
router.get('/:id', cashFlowController.getOne);
router.put('/:id', cashFlowController.update);
router.delete('/:id', cashFlowController.remove);
router.get('/:id/pdf', cashFlowController.downloadPdf);
router.put('/:id/lines', cashFlowController.saveLines);
router.post('/:id/actuals', cashFlowController.pullActuals);

module.exports = router;
