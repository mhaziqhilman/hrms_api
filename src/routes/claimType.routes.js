const express = require('express');
const router = express.Router();
const claimController = require('../controllers/claimController');
const { verifyToken } = require('../middleware/auth.middleware');

/**
 * @route   GET /api/claim-types
 * @desc    Get all claim types
 * @access  Private (All authenticated users)
 */
router.get(
  '/',
  verifyToken,
  claimController.getAllClaimTypes
);

module.exports = router;
