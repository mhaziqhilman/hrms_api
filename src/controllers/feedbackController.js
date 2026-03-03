const { Op } = require('sequelize');
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const Employee = require('../models/Employee');
const supabaseStorageService = require('../services/supabaseStorageService');
const logger = require('../utils/logger');
const path = require('path');
const crypto = require('crypto');

/**
 * Submit feedback
 * POST /api/feedback
 */
const submitFeedback = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.company_id || null;
    const { category, rating, description, page_url } = req.body;

    let screenshot_url = null;

    // Handle screenshot upload if provided
    if (req.file) {
      const ext = path.extname(req.file.originalname) || '.png';
      const filename = `${crypto.randomUUID()}${ext}`;
      const storagePath = `feedback/screenshots/${filename}`;

      await supabaseStorageService.uploadFile(
        req.file.buffer,
        storagePath,
        req.file.mimetype
      );
      screenshot_url = storagePath;
    }

    const feedback = await Feedback.create({
      user_id: userId,
      company_id: companyId,
      category,
      rating: parseInt(rating),
      description,
      screenshot_url,
      page_url: page_url || null
    });

    logger.info(`Feedback submitted: id=${feedback.id}, user=${userId}, category=${category}`);

    res.status(201).json({
      success: true,
      message: 'Thank you for your feedback!',
      data: feedback
    });
  } catch (error) {
    logger.error('Error submitting feedback:', error);
    next(error);
  }
};

/**
 * Get all feedback (super_admin only)
 * GET /api/feedback?status=new&category=bug&rating=5&search=text&page=1&limit=20&sort=created_at&order=DESC
 */
const getAllFeedback = async (req, res, next) => {
  try {
    const { status, category, rating, search, page = 1, limit = 20, sort = 'created_at', order = 'DESC' } = req.query;

    const where = {};

    if (status) where.status = status;
    if (category) where.category = category;
    if (rating) where.rating = parseInt(rating);

    if (search) {
      where[Op.or] = [
        { description: { [Op.iLike]: `%${search}%` } },
        { page_url: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const validSortFields = ['created_at', 'rating', 'status', 'category'];
    const sortField = validSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await Feedback.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email'],
        include: [{
          model: Employee,
          as: 'employee',
          attributes: ['full_name'],
          required: false
        }]
      }],
      order: [[sortField, sortOrder]],
      limit: parseInt(limit),
      offset
    });

    // Generate signed URLs for screenshots
    for (const feedback of rows) {
      if (feedback.screenshot_url && !feedback.screenshot_url.startsWith('http')) {
        try {
          feedback.dataValues.screenshot_signed_url = await supabaseStorageService.getSignedUrl(feedback.screenshot_url);
        } catch (err) {
          logger.warn(`Failed to generate signed URL for feedback ${feedback.id}:`, err.message);
        }
      }
    }

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        currentPage: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching feedback:', error);
    next(error);
  }
};

/**
 * Get feedback stats (super_admin only)
 * GET /api/feedback/stats
 */
const getFeedbackStats = async (req, res, next) => {
  try {
    const { sequelize } = require('../config/database');

    const [statusCounts] = await sequelize.query(`
      SELECT status, COUNT(*)::int as count
      FROM feedbacks
      GROUP BY status
    `);

    const [categoryCounts] = await sequelize.query(`
      SELECT category, COUNT(*)::int as count
      FROM feedbacks
      GROUP BY category
    `);

    const [ratingAvg] = await sequelize.query(`
      SELECT ROUND(AVG(rating)::numeric, 1) as average_rating, COUNT(*)::int as total
      FROM feedbacks
    `);

    res.json({
      success: true,
      data: {
        by_status: statusCounts,
        by_category: categoryCounts,
        average_rating: parseFloat(ratingAvg[0]?.average_rating) || 0,
        total: ratingAvg[0]?.total || 0
      }
    });
  } catch (error) {
    logger.error('Error fetching feedback stats:', error);
    next(error);
  }
};

/**
 * Get current user's feedback
 * GET /api/feedback/my?page=1&limit=10
 */
const getMyFeedback = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Feedback.findAndCountAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        currentPage: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching user feedback:', error);
    next(error);
  }
};

/**
 * Get single feedback detail
 * GET /api/feedback/:id
 */
const getFeedbackById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isSuperAdmin = req.user.role === 'super_admin';

    const where = { id };
    // Non-super_admin can only view their own feedback
    if (!isSuperAdmin) {
      where.user_id = userId;
    }

    const feedback = await Feedback.findOne({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email'],
        include: [{
          model: Employee,
          as: 'employee',
          attributes: ['full_name'],
          required: false
        }]
      }]
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }

    // Generate signed URL for screenshot
    if (feedback.screenshot_url && !feedback.screenshot_url.startsWith('http')) {
      try {
        feedback.dataValues.screenshot_signed_url = await supabaseStorageService.getSignedUrl(feedback.screenshot_url);
      } catch (err) {
        logger.warn(`Failed to generate signed URL for feedback ${feedback.id}:`, err.message);
      }
    }

    res.json({
      success: true,
      data: feedback
    });
  } catch (error) {
    logger.error('Error fetching feedback detail:', error);
    next(error);
  }
};

/**
 * Update feedback status (super_admin only)
 * PATCH /api/feedback/:id/status
 */
const updateFeedbackStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    const feedback = await Feedback.findByPk(id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }

    const updateData = { status };
    if (admin_notes !== undefined) {
      updateData.admin_notes = admin_notes;
    }
    if (status === 'resolved' && !feedback.resolved_at) {
      updateData.resolved_at = new Date();
    }

    await feedback.update(updateData);

    logger.info(`Feedback ${id} status updated to ${status}`);

    res.json({
      success: true,
      message: 'Feedback status updated',
      data: feedback
    });
  } catch (error) {
    logger.error('Error updating feedback status:', error);
    next(error);
  }
};

/**
 * Delete feedback (super_admin only)
 * DELETE /api/feedback/:id
 */
const deleteFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;

    const feedback = await Feedback.findByPk(id);
    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }

    // Delete screenshot from storage if exists
    if (feedback.screenshot_url) {
      try {
        await supabaseStorageService.deleteFile(feedback.screenshot_url);
      } catch (err) {
        logger.warn(`Failed to delete screenshot for feedback ${id}:`, err.message);
      }
    }

    await feedback.destroy();

    logger.info(`Feedback ${id} deleted`);

    res.json({
      success: true,
      message: 'Feedback deleted'
    });
  } catch (error) {
    logger.error('Error deleting feedback:', error);
    next(error);
  }
};

module.exports = {
  submitFeedback,
  getAllFeedback,
  getFeedbackStats,
  getMyFeedback,
  getFeedbackById,
  updateFeedbackStatus,
  deleteFeedback
};
