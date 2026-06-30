const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const {
  adminListSubscriptions,
  adminGetSubscription,
  adminOverridePlan,
  adminGrantTrial
} = require('../controllers/subscriptionController');

// Super Admin only — platform-wide subscription management.
router.use(verifyToken);
router.use(requireRole(['super_admin']));

router.get('/', adminListSubscriptions);
router.get('/:userId', adminGetSubscription);
router.patch('/:userId', adminOverridePlan);
router.post('/:userId/grant-trial', adminGrantTrial);

module.exports = router;
