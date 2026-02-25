const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation.middleware');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/rbac.middleware');
const controller = require('../controllers/announcementCategoryController');

// GET /api/announcement-categories - Get all categories
router.get('/', verifyToken, controller.getCategories);

// POST /api/announcement-categories - Create category
router.post('/',
  verifyToken,
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 100 }),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid hex color'),
    body('icon').optional().isString().isLength({ max: 50 })
  ],
  validate,
  controller.createCategory
);

// PUT /api/announcement-categories/:id - Update category
router.put('/:id',
  verifyToken,
  requireAdmin,
  [
    param('id').isInt(),
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
    body('icon').optional().isString().isLength({ max: 50 }),
    body('sort_order').optional().isInt(),
    body('is_active').optional().isBoolean()
  ],
  validate,
  controller.updateCategory
);

// DELETE /api/announcement-categories/:id - Delete category
router.delete('/:id',
  verifyToken,
  requireAdmin,
  [param('id').isInt()],
  validate,
  controller.deleteCategory
);

module.exports = router;
