const express = require('express');
const { body } = require('express-validator');
const claimTypeController = require('../controllers/claimTypeController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

/**
 * @route   GET /api/claim-types
 * @desc    Get all claim types
 * @access  Private (All authenticated users)
 */
router.get('/', verifyToken, claimTypeController.getAllClaimTypes);

/**
 * @route   GET /api/claim-types/:id
 * @desc    Get single claim type
 * @access  Private (Admin)
 */
router.get('/:id', verifyToken, requireAdmin, claimTypeController.getClaimType);

/**
 * @route   POST /api/claim-types
 * @desc    Create claim type
 * @access  Private (Admin)
 */
router.post(
  '/',
  verifyToken,
  requireAdmin,
  [
    body('name').notEmpty().withMessage('Claim type name is required'),
    body('max_amount').optional().isDecimal().withMessage('Max amount must be a valid number'),
    validate
  ],
  claimTypeController.createClaimType
);

/**
 * @route   PUT /api/claim-types/:id
 * @desc    Update claim type
 * @access  Private (Admin)
 */
router.put(
  '/:id',
  verifyToken,
  requireAdmin,
  [
    body('name').optional().notEmpty().withMessage('Claim type name cannot be empty'),
    body('max_amount').optional().isDecimal().withMessage('Max amount must be a valid number'),
    validate
  ],
  claimTypeController.updateClaimType
);

/**
 * @route   PATCH /api/claim-types/:id/toggle
 * @desc    Toggle claim type active status
 * @access  Private (Admin)
 */
router.patch('/:id/toggle', verifyToken, requireAdmin, claimTypeController.toggleClaimType);

module.exports = router;
