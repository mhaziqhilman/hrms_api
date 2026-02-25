const AnnouncementCategory = require('../models/AnnouncementCategory');
const Memo = require('../models/Memo');
const { Op, fn, col, literal } = require('sequelize');

// Get all categories for the current company (with memo counts)
exports.getCategories = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const categories = await AnnouncementCategory.findAll({
      where: { company_id, is_active: true },
      attributes: {
        include: [
          [
            literal(`(SELECT COUNT(*) FROM memos WHERE memos.category_id = "AnnouncementCategory".id AND memos.status = 'Published')`),
            'memo_count'
          ]
        ]
      },
      order: [['sort_order', 'ASC'], ['name', 'ASC']]
    });

    // Also get total published count for "All Announcement"
    const totalCount = await Memo.count({
      where: { company_id, status: 'Published' }
    });

    res.json({
      success: true,
      data: { categories, totalCount }
    });
  } catch (error) {
    console.error('Error fetching announcement categories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

// Create a new category
exports.createCategory = async (req, res) => {
  try {
    const { name, color, icon } = req.body;
    const company_id = req.user.company_id;

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Check for duplicate slug
    const existing = await AnnouncementCategory.findOne({
      where: { company_id, slug }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });
    }

    // Get max sort_order
    const maxOrder = await AnnouncementCategory.max('sort_order', { where: { company_id } }) || 0;

    const category = await AnnouncementCategory.create({
      company_id,
      name,
      slug,
      color: color || '#6B7280',
      icon: icon || null,
      sort_order: maxOrder + 1
    });

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category
    });
  } catch (error) {
    console.error('Error creating announcement category:', error);
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
};

// Update a category
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, icon, sort_order, is_active } = req.body;
    const company_id = req.user.company_id;

    const category = await AnnouncementCategory.findOne({
      where: { id, company_id }
    });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const updates = {};
    if (name !== undefined) {
      updates.name = name;
      updates.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    if (color !== undefined) updates.color = color;
    if (icon !== undefined) updates.icon = icon;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (is_active !== undefined) updates.is_active = is_active;

    await category.update(updates);

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: category
    });
  } catch (error) {
    console.error('Error updating announcement category:', error);
    res.status(500).json({ success: false, message: 'Failed to update category' });
  }
};

// Delete a category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;

    const category = await AnnouncementCategory.findOne({
      where: { id, company_id }
    });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    // Set category_id to null for memos using this category
    await Memo.update(
      { category_id: null },
      { where: { category_id: id, company_id } }
    );

    await category.destroy();

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting announcement category:', error);
    res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
};
