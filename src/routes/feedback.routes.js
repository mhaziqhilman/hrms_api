const express = require('express');
const router = express.Router();
const multer = require('multer');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/rbac.middleware');
const {
  submitFeedback,
  getAllFeedback,
  getFeedbackStats,
  getMyFeedback,
  getFeedbackById,
  updateFeedbackStatus,
  deleteFeedback
} = require('../controllers/feedbackController');

// Multer config for screenshot upload (memory storage → Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
    }
  }
});

// Validation rules
const submitFeedbackValidation = [
  body('category')
    .notEmpty().withMessage('Category is required')
    .isIn(['bug', 'feature_request', 'ui_ux', 'performance', 'general'])
    .withMessage('Invalid category'),
  body('rating')
    .notEmpty().withMessage('Rating is required')
    .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('description')
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 10 }).withMessage('Description must be at least 10 characters')
];

const updateStatusValidation = [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['new', 'in_review', 'resolved', 'closed'])
    .withMessage('Invalid status')
];

// All routes require authentication
router.use(verifyToken);

// User routes
router.post('/', upload.single('screenshot'), submitFeedbackValidation, validate, submitFeedback);
router.get('/my', getMyFeedback);

// Admin routes (super_admin only)
router.get('/stats', requireRole(['super_admin']), getFeedbackStats);
router.get('/', requireRole(['super_admin']), getAllFeedback);
router.get('/:id', getFeedbackById);
router.patch('/:id/status', requireRole(['super_admin']), updateStatusValidation, validate, updateFeedbackStatus);
router.delete('/:id', requireRole(['super_admin']), deleteFeedback);

module.exports = router;
