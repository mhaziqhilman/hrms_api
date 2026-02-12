const { LeaveType } = require('../models');
const logger = require('../utils/logger');

/**
 * Get all leave types for the user's company
 */
exports.getAllLeaveTypes = async (req, res) => {
  try {
    const { company_id } = req.user;
    const { include_inactive } = req.query;

    const where = { company_id };
    if (!include_inactive) {
      where.is_active = true;
    }

    const leaveTypes = await LeaveType.findAll({
      where,
      order: [['name', 'ASC']]
    });

    res.json({ success: true, data: leaveTypes });
  } catch (error) {
    logger.error('Error fetching leave types:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave types' });
  }
};

/**
 * Get a single leave type by ID
 */
exports.getLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const leaveType = await LeaveType.findOne({ where: { id, company_id } });
    if (!leaveType) {
      return res.status(404).json({ success: false, message: 'Leave type not found' });
    }

    res.json({ success: true, data: leaveType });
  } catch (error) {
    logger.error('Error fetching leave type:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave type' });
  }
};

/**
 * Create a new leave type
 */
exports.createLeaveType = async (req, res) => {
  try {
    const { company_id } = req.user;
    const {
      name, days_per_year, is_paid, carry_forward_allowed,
      carry_forward_max_days, prorate_for_new_joiners, requires_document, description
    } = req.body;

    const trimmedName = name ? name.trim() : name;

    const existing = await LeaveType.findOne({ where: { company_id, name: trimmedName } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A leave type with this name already exists' });
    }

    const leaveType = await LeaveType.create({
      company_id,
      name: trimmedName,
      days_per_year: days_per_year || 0,
      is_paid: is_paid !== undefined ? is_paid : true,
      carry_forward_allowed: carry_forward_allowed || false,
      carry_forward_max_days: carry_forward_max_days || 0,
      prorate_for_new_joiners: prorate_for_new_joiners !== undefined ? prorate_for_new_joiners : true,
      requires_document: requires_document || false,
      description: description || null,
      is_active: true
    });

    logger.info(`Leave type created: ${name} (company: ${company_id})`);
    res.status(201).json({ success: true, data: leaveType, message: 'Leave type created successfully' });
  } catch (error) {
    logger.error('Error creating leave type:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'A leave type with this name already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create leave type' });
  }
};

/**
 * Update a leave type
 */
exports.updateLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const leaveType = await LeaveType.findOne({ where: { id, company_id } });
    if (!leaveType) {
      return res.status(404).json({ success: false, message: 'Leave type not found' });
    }

    const allowedFields = [
      'name', 'days_per_year', 'is_paid', 'carry_forward_allowed',
      'carry_forward_max_days', 'prorate_for_new_joiners', 'requires_document', 'description'
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (updateData.name && updateData.name !== leaveType.name) {
      const existing = await LeaveType.findOne({ where: { company_id, name: updateData.name } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'A leave type with this name already exists' });
      }
    }

    await leaveType.update(updateData);

    logger.info(`Leave type updated: ${leaveType.name} (ID: ${id})`);
    res.json({ success: true, data: leaveType, message: 'Leave type updated successfully' });
  } catch (error) {
    logger.error('Error updating leave type:', error);
    res.status(500).json({ success: false, message: 'Failed to update leave type' });
  }
};

/**
 * Toggle leave type active status
 */
exports.toggleLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const leaveType = await LeaveType.findOne({ where: { id, company_id } });
    if (!leaveType) {
      return res.status(404).json({ success: false, message: 'Leave type not found' });
    }

    await leaveType.update({ is_active: !leaveType.is_active });

    const status = leaveType.is_active ? 'activated' : 'deactivated';
    logger.info(`Leave type ${status}: ${leaveType.name} (ID: ${id})`);
    res.json({ success: true, data: leaveType, message: `Leave type ${status} successfully` });
  } catch (error) {
    logger.error('Error toggling leave type:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle leave type' });
  }
};
