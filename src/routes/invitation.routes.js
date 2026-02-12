const express = require('express');
const { body } = require('express-validator');
const invitationController = require('../controllers/invitationController');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = express.Router();

/**
 * @route   POST /api/invitations
 * @desc    Invite a user to the company
 * @access  Private (Admin)
 */
router.post(
  '/',
  verifyToken,
  requireAdmin,
  [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('role').optional().isIn(['admin', 'manager', 'staff']).withMessage('Invalid role'),
    validate
  ],
  invitationController.inviteUser
);

/**
 * @route   GET /api/invitations/info
 * @desc    Get invitation details by token (public)
 * @access  Public
 */
router.get('/info', invitationController.getInvitationInfo);

/**
 * @route   POST /api/invitations/accept
 * @desc    Accept an invitation
 * @access  Private (must be logged in)
 */
router.post(
  '/accept',
  verifyToken,
  [
    body('token').notEmpty().withMessage('Invitation token is required'),
    validate
  ],
  invitationController.acceptInvitation
);

/**
 * @route   POST /api/invitations/auto-accept
 * @desc    Auto-accept pending invitations for the authenticated user
 * @access  Private
 */
router.post('/auto-accept', verifyToken, invitationController.autoAccept);

/**
 * @route   GET /api/invitations
 * @desc    Get company invitations
 * @access  Private (Admin)
 */
router.get('/', verifyToken, requireAdmin, invitationController.getInvitations);

/**
 * @route   PUT /api/invitations/:id/cancel
 * @desc    Cancel a pending invitation
 * @access  Private (Admin)
 */
router.put('/:id/cancel', verifyToken, requireAdmin, invitationController.cancelInvitation);

/**
 * @route   POST /api/invitations/:id/resend
 * @desc    Resend an invitation
 * @access  Private (Admin)
 */
router.post('/:id/resend', verifyToken, requireAdmin, invitationController.resendInvitation);

module.exports = router;
