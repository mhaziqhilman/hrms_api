const { LeaveEntitlement, Employee, LeaveType } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

// Get all entitlements with filters and pagination
exports.getAllEntitlements = async (req, res, next) => {
  try {
    const { year, employee_id, leave_type_id, search, page = 1, limit = 20 } = req.query;
    const company_id = req.user.company_id;

    const where = {};
    if (year) where.year = parseInt(year);
    if (employee_id) where.employee_id = parseInt(employee_id);
    if (leave_type_id) where.leave_type_id = parseInt(leave_type_id);

    const employeeWhere = { company_id };
    if (search) {
      employeeWhere.full_name = { [Op.iLike]: `%${search}%` };
    }

    const { count, rows } = await LeaveEntitlement.findAndCountAll({
      where,
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department', 'position'],
          where: employeeWhere,
          required: true
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name', 'days_per_year', 'is_paid']
        }
      ],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [
        [{ model: Employee, as: 'employee' }, 'full_name', 'ASC'],
        [{ model: LeaveType, as: 'leave_type' }, 'name', 'ASC']
      ],
      distinct: true
    });

    res.json({
      success: true,
      data: {
        entitlements: rows,
        pagination: {
          total: count,
          currentPage: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching leave entitlements:', error);
    next(error);
  }
};

// Get single entitlement
exports.getEntitlement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;

    const entitlement = await LeaveEntitlement.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department', 'position'],
          where: { company_id },
          required: true
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name', 'days_per_year', 'is_paid']
        }
      ]
    });

    if (!entitlement) {
      return res.status(404).json({ success: false, message: 'Leave entitlement not found' });
    }

    res.json({ success: true, data: entitlement });
  } catch (error) {
    logger.error('Error fetching leave entitlement:', error);
    next(error);
  }
};

// Create a single entitlement
exports.createEntitlement = async (req, res, next) => {
  try {
    const { employee_id, leave_type_id, year, total_days, carry_forward_days = 0 } = req.body;
    const company_id = req.user.company_id;

    // Validate employee belongs to company
    const employee = await Employee.findOne({ where: { id: employee_id, company_id } });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found in your company' });
    }

    // Validate leave type belongs to company
    const leaveType = await LeaveType.findOne({ where: { id: leave_type_id, company_id } });
    if (!leaveType) {
      return res.status(404).json({ success: false, message: 'Leave type not found in your company' });
    }

    // Check duplicate
    const existing = await LeaveEntitlement.findOne({
      where: { employee_id, leave_type_id, year }
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Entitlement already exists for ${employee.full_name} - ${leaveType.name} (${year})`
      });
    }

    const balance_days = parseFloat(total_days) + parseFloat(carry_forward_days);

    const entitlement = await LeaveEntitlement.create({
      employee_id,
      leave_type_id,
      year,
      total_days,
      carry_forward_days,
      used_days: 0,
      pending_days: 0,
      balance_days
    });

    // Fetch with associations
    const created = await LeaveEntitlement.findByPk(entitlement.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department', 'position']
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name', 'days_per_year', 'is_paid']
        }
      ]
    });

    logger.info(`Leave entitlement created: ${employee.full_name} - ${leaveType.name} (${year})`, {
      user_id: req.user.id,
      employee_id,
      leave_type_id,
      year,
      total_days
    });

    res.status(201).json({
      success: true,
      data: created,
      message: 'Leave entitlement created successfully'
    });
  } catch (error) {
    logger.error('Error creating leave entitlement:', error);
    next(error);
  }
};

// Update an entitlement
exports.updateEntitlement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { total_days, carry_forward_days } = req.body;
    const company_id = req.user.company_id;

    const entitlement = await LeaveEntitlement.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name'],
          where: { company_id },
          required: true
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!entitlement) {
      return res.status(404).json({ success: false, message: 'Leave entitlement not found' });
    }

    const updateData = {};
    const newTotalDays = total_days !== undefined ? parseFloat(total_days) : parseFloat(entitlement.total_days);
    const newCarryForward = carry_forward_days !== undefined ? parseFloat(carry_forward_days) : parseFloat(entitlement.carry_forward_days);
    const usedDays = parseFloat(entitlement.used_days);
    const pendingDays = parseFloat(entitlement.pending_days);

    const newBalance = newTotalDays + newCarryForward - usedDays - pendingDays;

    if (newBalance < 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot update: new balance would be ${newBalance} days. Total + carry forward must be at least ${usedDays + pendingDays} (used: ${usedDays}, pending: ${pendingDays}).`
      });
    }

    if (total_days !== undefined) updateData.total_days = total_days;
    if (carry_forward_days !== undefined) updateData.carry_forward_days = carry_forward_days;
    updateData.balance_days = newBalance;

    await entitlement.update(updateData);

    // Refetch with associations
    const updated = await LeaveEntitlement.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department', 'position']
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name', 'days_per_year', 'is_paid']
        }
      ]
    });

    logger.info(`Leave entitlement updated: ID ${id}`, {
      user_id: req.user.id,
      total_days: newTotalDays,
      carry_forward_days: newCarryForward,
      new_balance: newBalance
    });

    res.json({
      success: true,
      data: updated,
      message: 'Leave entitlement updated successfully'
    });
  } catch (error) {
    logger.error('Error updating leave entitlement:', error);
    next(error);
  }
};

// Delete an entitlement
exports.deleteEntitlement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;

    const entitlement = await LeaveEntitlement.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'full_name'],
          where: { company_id },
          required: true
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!entitlement) {
      return res.status(404).json({ success: false, message: 'Leave entitlement not found' });
    }

    if (parseFloat(entitlement.used_days) > 0 || parseFloat(entitlement.pending_days) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete entitlement with used or pending leave days. Cancel or reject pending leaves first.'
      });
    }

    await entitlement.destroy();

    logger.info(`Leave entitlement deleted: ${entitlement.employee.full_name} - ${entitlement.leave_type.name} (${entitlement.year})`, {
      user_id: req.user.id
    });

    res.json({ success: true, message: 'Leave entitlement deleted successfully' });
  } catch (error) {
    logger.error('Error deleting leave entitlement:', error);
    next(error);
  }
};

// Bulk initialize entitlements for a year
exports.initializeYear = async (req, res, next) => {
  try {
    const { year } = req.body;
    const company_id = req.user.company_id;

    // Get all active employees for this company
    const employees = await Employee.findAll({
      where: { company_id, employment_status: 'Active' },
      attributes: ['id', 'full_name']
    });

    // Get all active leave types for this company
    const leaveTypes = await LeaveType.findAll({
      where: { company_id, is_active: true },
      attributes: ['id', 'name', 'days_per_year']
    });

    if (employees.length === 0) {
      return res.status(400).json({ success: false, message: 'No active employees found in your company' });
    }

    if (leaveTypes.length === 0) {
      return res.status(400).json({ success: false, message: 'No active leave types found in your company' });
    }

    let created = 0;
    let skipped = 0;

    for (const employee of employees) {
      for (const leaveType of leaveTypes) {
        const existing = await LeaveEntitlement.findOne({
          where: { employee_id: employee.id, leave_type_id: leaveType.id, year }
        });

        if (existing) {
          skipped++;
          continue;
        }

        await LeaveEntitlement.create({
          employee_id: employee.id,
          leave_type_id: leaveType.id,
          year,
          total_days: leaveType.days_per_year,
          used_days: 0,
          pending_days: 0,
          balance_days: leaveType.days_per_year,
          carry_forward_days: 0
        });
        created++;
      }
    }

    logger.info(`Initialized entitlements for ${year}: ${created} created, ${skipped} skipped`, {
      user_id: req.user.id,
      company_id,
      year,
      total_employees: employees.length,
      total_leave_types: leaveTypes.length
    });

    res.status(201).json({
      success: true,
      data: {
        year,
        created,
        skipped,
        total_employees: employees.length,
        total_leave_types: leaveTypes.length
      },
      message: `${created} entitlements created, ${skipped} already existed`
    });
  } catch (error) {
    logger.error('Error initializing year entitlements:', error);
    next(error);
  }
};
