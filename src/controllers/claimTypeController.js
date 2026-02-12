const { ClaimType } = require('../models');
const logger = require('../utils/logger');

/**
 * Get all claim types for the user's company
 */
exports.getAllClaimTypes = async (req, res) => {
  try {
    const { company_id } = req.user;
    const { include_inactive } = req.query;

    const where = { company_id };
    if (!include_inactive) {
      where.is_active = true;
    }

    const claimTypes = await ClaimType.findAll({
      where,
      order: [['name', 'ASC']]
    });

    res.json({ success: true, data: claimTypes });
  } catch (error) {
    logger.error('Error fetching claim types:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch claim types' });
  }
};

/**
 * Get a single claim type by ID
 */
exports.getClaimType = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const claimType = await ClaimType.findOne({ where: { id, company_id } });
    if (!claimType) {
      return res.status(404).json({ success: false, message: 'Claim type not found' });
    }

    res.json({ success: true, data: claimType });
  } catch (error) {
    logger.error('Error fetching claim type:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch claim type' });
  }
};

/**
 * Create a new claim type
 */
exports.createClaimType = async (req, res) => {
  try {
    const { company_id } = req.user;
    const { name, description, requires_receipt, max_amount } = req.body;

    const trimmedName = name ? name.trim() : name;

    const existing = await ClaimType.findOne({ where: { company_id, name: trimmedName } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A claim type with this name already exists' });
    }

    const claimType = await ClaimType.create({
      company_id,
      name: trimmedName,
      description: description || null,
      requires_receipt: requires_receipt !== undefined ? requires_receipt : true,
      max_amount: max_amount || null,
      is_active: true
    });

    logger.info(`Claim type created: ${trimmedName} (company: ${company_id})`);
    res.status(201).json({ success: true, data: claimType, message: 'Claim type created successfully' });
  } catch (error) {
    logger.error('Error creating claim type:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'A claim type with this name already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create claim type' });
  }
};

/**
 * Update a claim type
 */
exports.updateClaimType = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const claimType = await ClaimType.findOne({ where: { id, company_id } });
    if (!claimType) {
      return res.status(404).json({ success: false, message: 'Claim type not found' });
    }

    const allowedFields = ['name', 'description', 'requires_receipt', 'max_amount'];
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (updateData.name && updateData.name !== claimType.name) {
      const existing = await ClaimType.findOne({ where: { company_id, name: updateData.name } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'A claim type with this name already exists' });
      }
    }

    await claimType.update(updateData);

    logger.info(`Claim type updated: ${claimType.name} (ID: ${id})`);
    res.json({ success: true, data: claimType, message: 'Claim type updated successfully' });
  } catch (error) {
    logger.error('Error updating claim type:', error);
    res.status(500).json({ success: false, message: 'Failed to update claim type' });
  }
};

/**
 * Toggle claim type active status
 */
exports.toggleClaimType = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const claimType = await ClaimType.findOne({ where: { id, company_id } });
    if (!claimType) {
      return res.status(404).json({ success: false, message: 'Claim type not found' });
    }

    await claimType.update({ is_active: !claimType.is_active });

    const status = claimType.is_active ? 'activated' : 'deactivated';
    logger.info(`Claim type ${status}: ${claimType.name} (ID: ${id})`);
    res.json({ success: true, data: claimType, message: `Claim type ${status} successfully` });
  } catch (error) {
    logger.error('Error toggling claim type:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle claim type' });
  }
};
