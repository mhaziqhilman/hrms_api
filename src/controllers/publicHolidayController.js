const { PublicHoliday } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * Get all public holidays for the user's company
 */
exports.getAllHolidays = async (req, res) => {
  try {
    const { company_id } = req.user;
    const { year } = req.query;

    const where = { company_id };
    if (year) {
      where.date = {
        [Op.between]: [`${year}-01-01`, `${year}-12-31`]
      };
    }

    const holidays = await PublicHoliday.findAll({
      where,
      order: [['date', 'ASC']]
    });

    res.json({ success: true, data: holidays });
  } catch (error) {
    logger.error('Error fetching public holidays:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch public holidays' });
  }
};

/**
 * Get a single public holiday by ID
 */
exports.getHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const holiday = await PublicHoliday.findOne({ where: { id, company_id } });
    if (!holiday) {
      return res.status(404).json({ success: false, message: 'Public holiday not found' });
    }

    res.json({ success: true, data: holiday });
  } catch (error) {
    logger.error('Error fetching public holiday:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch public holiday' });
  }
};

/**
 * Create a new public holiday
 */
exports.createHoliday = async (req, res) => {
  try {
    const { company_id } = req.user;
    const { name, date, description, is_recurring } = req.body;

    const existing = await PublicHoliday.findOne({ where: { company_id, name, date } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A holiday with this name and date already exists' });
    }

    const holiday = await PublicHoliday.create({
      company_id,
      name,
      date,
      description: description || null,
      is_recurring: is_recurring || false
    });

    logger.info(`Public holiday created: ${name} on ${date} (company: ${company_id})`);
    res.status(201).json({ success: true, data: holiday, message: 'Public holiday created successfully' });
  } catch (error) {
    logger.error('Error creating public holiday:', error);
    res.status(500).json({ success: false, message: 'Failed to create public holiday' });
  }
};

/**
 * Update a public holiday
 */
exports.updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const holiday = await PublicHoliday.findOne({ where: { id, company_id } });
    if (!holiday) {
      return res.status(404).json({ success: false, message: 'Public holiday not found' });
    }

    const allowedFields = ['name', 'date', 'description', 'is_recurring'];
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    await holiday.update(updateData);

    logger.info(`Public holiday updated: ${holiday.name} (ID: ${id})`);
    res.json({ success: true, data: holiday, message: 'Public holiday updated successfully' });
  } catch (error) {
    logger.error('Error updating public holiday:', error);
    res.status(500).json({ success: false, message: 'Failed to update public holiday' });
  }
};

/**
 * Delete a public holiday
 */
exports.deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const holiday = await PublicHoliday.findOne({ where: { id, company_id } });
    if (!holiday) {
      return res.status(404).json({ success: false, message: 'Public holiday not found' });
    }

    const name = holiday.name;
    await holiday.destroy();

    logger.info(`Public holiday deleted: ${name} (ID: ${id})`);
    res.json({ success: true, message: 'Public holiday deleted successfully' });
  } catch (error) {
    logger.error('Error deleting public holiday:', error);
    res.status(500).json({ success: false, message: 'Failed to delete public holiday' });
  }
};
