const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../controllers/notificationController');

// All routes require authentication
router.use(verifyToken);

// GET /api/notifications - List notifications with filters
router.get('/', getNotifications);

// GET /api/notifications/unread-count - Get unread count for badge
router.get('/unread-count', getUnreadCount);

// PATCH /api/notifications/mark-all-read - Mark all as read
router.patch('/mark-all-read', markAllAsRead);

// PATCH /api/notifications/:id/read - Mark single as read
router.patch('/:id/read', markAsRead);

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', deleteNotification);

module.exports = router;
