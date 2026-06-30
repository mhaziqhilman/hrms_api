const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const {
  getMySubscription,
  getMyUsage,
  changeMyPlan,
  subscribeMe,
  cancelMyPlan,
  getMyHistory
} = require('../controllers/subscriptionController');

// All subscription routes require an authenticated user
router.use(verifyToken);

router.get('/me', getMySubscription);
router.get('/usage', getMyUsage);
router.get('/history', getMyHistory);
router.post('/subscribe', subscribeMe);
router.post('/change', changeMyPlan);
router.post('/cancel', cancelMyPlan);

module.exports = router;
