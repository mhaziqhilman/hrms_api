const { Leave, Employee, LeaveType, LeaveEntitlement, User } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Get all leave applications with pagination and filtering
 */
exports.getAllLeaves = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      employee_id,
      leave_type_id,
      start_date,
      end_date
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    // Apply filters
    if (status) where.status = status;
    if (employee_id) where.employee_id = employee_id;
    if (leave_type_id) where.leave_type_id = leave_type_id;
    if (start_date && end_date) {
      where.start_date = { [Op.between]: [start_date, end_date] };
    }

    // Non-admin users can only see their own leaves or their team's leaves
    if (req.user.role === 'staff') {
      if (!req.user.employee_id) {
        return res.status(200).json({
          success: true,
          data: { leaves: [], pagination: { total: 0, currentPage: 1, limit: parseInt(limit), totalPages: 0 } }
        });
      }
      where.employee_id = req.user.employee_id;
    }

    const { count, rows } = await Leave.findAndCountAll({
      where,
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department', 'position'],
          where: { company_id: req.user.company_id },
          required: true
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name', 'is_paid']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'email', 'role']
        }
      ],
      limit: parseInt(limit),
      offset: offset,
      order: [['created_at', 'DESC']],
      distinct: true
    });

    logger.info(`Retrieved ${rows.length} leave applications`, {
      user_id: req.user.id,
      filters: where
    });

    res.status(200).json({
      success: true,
      data: {
        leaves: rows,
        pagination: {
          total: count,
          currentPage: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching leaves:', error);
    next(error);
  }
};

/**
 * Get single leave application by ID
 */
exports.getLeaveById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const leave = await Leave.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department', 'position', 'reporting_manager_id'],
          where: { company_id: req.user.company_id },
          required: true
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name', 'is_paid', 'requires_document']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'email', 'role']
        }
      ]
    });

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave application not found'
      });
    }

    // Check permissions
    if (req.user.role === 'staff' && req.user.employee_id !== leave.employee_id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this leave application'
      });
    }

    logger.info(`Retrieved leave ${id}`, { user_id: req.user.id });

    res.status(200).json({
      success: true,
      data: leave
    });
  } catch (error) {
    logger.error(`Error fetching leave ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Apply for leave
 */
exports.applyLeave = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      employee_id,
      leave_type_id,
      start_date,
      end_date,
      is_half_day = false,
      half_day_period,
      reason,
      attachment_url
    } = req.body;

    // Staff can only apply for their own leave
    if (req.user.role === 'staff' && req.user.employee_id !== parseInt(employee_id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only apply for your own leave'
      });
    }

    // Validate employee exists and belongs to active company
    const employee = await Employee.findOne({
      where: { id: employee_id, company_id: req.user.company_id }
    });
    if (!employee) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Validate leave type exists
    const leaveType = await LeaveType.findByPk(leave_type_id);
    if (!leaveType) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Leave type not found'
      });
    }

    // Calculate total days
    const start = new Date(start_date);
    const end = new Date(end_date);
    let total_days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    if (is_half_day) {
      total_days = 0.5;
    }

    // Check leave entitlement and balance
    const currentYear = new Date().getFullYear();
    const entitlement = await LeaveEntitlement.findOne({
      where: {
        employee_id,
        leave_type_id,
        year: currentYear
      }
    });

    if (!entitlement) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Leave entitlement not found for this year'
      });
    }

    if (entitlement.balance_days < total_days) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Insufficient leave balance. Available: ${entitlement.balance_days} days, Requested: ${total_days} days`
      });
    }

    // Check for overlapping leave applications
    const overlappingLeave = await Leave.findOne({
      where: {
        employee_id,
        status: { [Op.in]: ['Pending', 'Approved'] },
        [Op.or]: [
          {
            start_date: { [Op.between]: [start_date, end_date] }
          },
          {
            end_date: { [Op.between]: [start_date, end_date] }
          },
          {
            [Op.and]: [
              { start_date: { [Op.lte]: start_date } },
              { end_date: { [Op.gte]: end_date } }
            ]
          }
        ]
      }
    });

    if (overlappingLeave) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: 'You already have a leave application for this date range'
      });
    }

    // Create leave application
    const leave = await Leave.create({
      employee_id,
      leave_type_id,
      start_date,
      end_date,
      total_days,
      is_half_day,
      half_day_period,
      reason,
      attachment_url,
      status: 'Pending'
    }, { transaction });

    // Update entitlement pending days
    await entitlement.update({
      pending_days: parseFloat(entitlement.pending_days) + parseFloat(total_days),
      balance_days: parseFloat(entitlement.balance_days) - parseFloat(total_days)
    }, { transaction });

    await transaction.commit();

    // Fetch the created leave with associations
    const createdLeave = await Leave.findByPk(leave.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department']
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name', 'is_paid']
        }
      ]
    });

    logger.info(`Leave application created: ${leave.id}`, {
      user_id: req.user.id,
      employee_id,
      leave_type_id,
      total_days
    });

    res.status(201).json({
      success: true,
      message: 'Leave application submitted successfully',
      data: createdLeave
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error applying for leave:', error);
    next(error);
  }
};

/**
 * Update leave application (only Pending leaves can be updated)
 */
exports.updateLeave = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const {
      start_date,
      end_date,
      is_half_day,
      half_day_period,
      reason,
      attachment_url
    } = req.body;

    const leave = await Leave.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          where: { company_id: req.user.company_id },
          required: true
        },
        {
          model: LeaveType,
          as: 'leave_type'
        }
      ]
    });

    if (!leave) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Leave application not found'
      });
    }

    // Only the employee who applied or admin/manager can update
    if (req.user.role === 'staff' && req.user.employee_id !== leave.employee_id) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this leave application'
      });
    }

    // Only pending leaves can be updated
    if (leave.status !== 'Pending') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot update leave with status ${leave.status}`
      });
    }

    // Calculate old and new total days
    const oldTotalDays = parseFloat(leave.total_days);
    let newTotalDays = oldTotalDays;

    if (start_date || end_date || is_half_day !== undefined) {
      const newStartDate = start_date ? new Date(start_date) : new Date(leave.start_date);
      const newEndDate = end_date ? new Date(end_date) : new Date(leave.end_date);
      const newIsHalfDay = is_half_day !== undefined ? is_half_day : leave.is_half_day;

      newTotalDays = Math.ceil((newEndDate - newStartDate) / (1000 * 60 * 60 * 24)) + 1;
      if (newIsHalfDay) {
        newTotalDays = 0.5;
      }
    }

    // Update leave entitlement if total days changed
    if (newTotalDays !== oldTotalDays) {
      const currentYear = new Date().getFullYear();
      const entitlement = await LeaveEntitlement.findOne({
        where: {
          employee_id: leave.employee_id,
          leave_type_id: leave.leave_type_id,
          year: currentYear
        }
      });

      if (entitlement) {
        const daysDifference = newTotalDays - oldTotalDays;
        const newBalance = parseFloat(entitlement.balance_days) - daysDifference;

        if (newBalance < 0) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Insufficient leave balance for the updated dates. Available: ${entitlement.balance_days} days, Additional needed: ${daysDifference} days`
          });
        }

        await entitlement.update({
          pending_days: parseFloat(entitlement.pending_days) + daysDifference,
          balance_days: newBalance
        }, { transaction });
      }
    }

    // Update leave application
    await leave.update({
      start_date: start_date || leave.start_date,
      end_date: end_date || leave.end_date,
      total_days: newTotalDays,
      is_half_day: is_half_day !== undefined ? is_half_day : leave.is_half_day,
      half_day_period: half_day_period || leave.half_day_period,
      reason: reason || leave.reason,
      attachment_url: attachment_url !== undefined ? attachment_url : leave.attachment_url
    }, { transaction });

    await transaction.commit();

    // Fetch updated leave
    const updatedLeave = await Leave.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department']
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name', 'is_paid']
        }
      ]
    });

    logger.info(`Leave application updated: ${id}`, { user_id: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Leave application updated successfully',
      data: updatedLeave
    });
  } catch (error) {
    await transaction.rollback();
    logger.error(`Error updating leave ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Approve or reject leave application
 */
exports.approveRejectLeave = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const { action, rejection_reason } = req.body; // action: 'approve' or 'reject'

    const leave = await Leave.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          where: { company_id: req.user.company_id },
          required: true
        },
        {
          model: LeaveType,
          as: 'leave_type'
        }
      ]
    });

    if (!leave) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Leave application not found'
      });
    }

    // Only pending leaves can be approved/rejected
    if (leave.status !== 'Pending') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot ${action} leave with status ${leave.status}`
      });
    }

    // Only admin or manager can approve/reject
    if (req.user.role === 'staff') {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to approve/reject leave applications'
      });
    }

    const currentYear = new Date().getFullYear();
    const entitlement = await LeaveEntitlement.findOne({
      where: {
        employee_id: leave.employee_id,
        leave_type_id: leave.leave_type_id,
        year: currentYear
      }
    });

    if (action === 'approve') {
      // Approve leave
      await leave.update({
        status: 'Approved',
        approver_id: req.user.id,
        approved_at: new Date()
      }, { transaction });

      // Update entitlement: move from pending to used
      if (entitlement) {
        await entitlement.update({
          pending_days: parseFloat(entitlement.pending_days) - parseFloat(leave.total_days),
          used_days: parseFloat(entitlement.used_days) + parseFloat(leave.total_days)
        }, { transaction });
      }

      logger.info(`Leave approved: ${id}`, { user_id: req.user.id });
    } else if (action === 'reject') {
      // Reject leave
      if (!rejection_reason) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      await leave.update({
        status: 'Rejected',
        approver_id: req.user.id,
        approved_at: new Date(),
        rejection_reason
      }, { transaction });

      // Update entitlement: restore balance from pending
      if (entitlement) {
        await entitlement.update({
          pending_days: parseFloat(entitlement.pending_days) - parseFloat(leave.total_days),
          balance_days: parseFloat(entitlement.balance_days) + parseFloat(leave.total_days)
        }, { transaction });
      }

      logger.info(`Leave rejected: ${id}`, { user_id: req.user.id });
    } else {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    await transaction.commit();

    // Fetch updated leave
    const updatedLeave = await Leave.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department']
        },
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name', 'is_paid']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'email', 'role']
        }
      ]
    });

    res.status(200).json({
      success: true,
      message: `Leave application ${action}d successfully`,
      data: updatedLeave
    });
  } catch (error) {
    await transaction.rollback();
    logger.error(`Error ${req.body.action}ing leave ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Cancel leave application
 */
exports.cancelLeave = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    const leave = await Leave.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });

    if (!leave) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Leave application not found'
      });
    }

    // Only the employee or admin can cancel
    if (req.user.role === 'staff' && req.user.employee_id !== leave.employee_id) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to cancel this leave application'
      });
    }

    // Only pending or approved leaves can be cancelled
    if (!['Pending', 'Approved'].includes(leave.status)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot cancel leave with status ${leave.status}`
      });
    }

    const oldStatus = leave.status;

    // Update leave status
    await leave.update({
      status: 'Cancelled'
    }, { transaction });

    // Update entitlement
    const currentYear = new Date().getFullYear();
    const entitlement = await LeaveEntitlement.findOne({
      where: {
        employee_id: leave.employee_id,
        leave_type_id: leave.leave_type_id,
        year: currentYear
      }
    });

    if (entitlement) {
      if (oldStatus === 'Pending') {
        // Restore from pending
        await entitlement.update({
          pending_days: parseFloat(entitlement.pending_days) - parseFloat(leave.total_days),
          balance_days: parseFloat(entitlement.balance_days) + parseFloat(leave.total_days)
        }, { transaction });
      } else if (oldStatus === 'Approved') {
        // Restore from used
        await entitlement.update({
          used_days: parseFloat(entitlement.used_days) - parseFloat(leave.total_days),
          balance_days: parseFloat(entitlement.balance_days) + parseFloat(leave.total_days)
        }, { transaction });
      }
    }

    await transaction.commit();

    logger.info(`Leave cancelled: ${id}`, { user_id: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Leave application cancelled successfully'
    });
  } catch (error) {
    await transaction.rollback();
    logger.error(`Error cancelling leave ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Get leave balance for an employee
 */
exports.getLeaveBalance = async (req, res, next) => {
  try {
    const { employee_id } = req.params;
    const { year = new Date().getFullYear() } = req.query;

    // Staff can only view their own balance
    if (req.user.role === 'staff' && req.user.employee_id !== parseInt(employee_id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own leave balance'
      });
    }

    const employee = await Employee.findOne({
      where: { id: employee_id, company_id: req.user.company_id },
      attributes: ['id', 'employee_id', 'full_name']
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const entitlements = await LeaveEntitlement.findAll({
      where: {
        employee_id,
        year
      },
      include: [
        {
          model: LeaveType,
          as: 'leave_type',
          attributes: ['id', 'name', 'is_paid', 'carry_forward_allowed']
        }
      ]
    });

    logger.info(`Retrieved leave balance for employee ${employee_id}`, {
      user_id: req.user.id
    });

    res.status(200).json({
      success: true,
      data: {
        employee,
        year: parseInt(year),
        entitlements: entitlements.map(ent => ({
          leave_type: ent.leave_type,
          total_days: parseFloat(ent.total_days),
          used_days: parseFloat(ent.used_days),
          pending_days: parseFloat(ent.pending_days),
          balance_days: parseFloat(ent.balance_days),
          carry_forward_days: parseFloat(ent.carry_forward_days)
        }))
      }
    });
  } catch (error) {
    logger.error(`Error fetching leave balance for employee ${req.params.employee_id}:`, error);
    next(error);
  }
};
