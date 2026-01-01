const { Attendance, Employee, WFHApplication, User } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Clock in
 */
exports.clockIn = async (req, res, next) => {
  try {
    const {
      employee_id,
      type = 'Office',
      location_lat,
      location_long,
      location_address
    } = req.body;

    // Staff can only clock in for themselves
    if (req.user.role === 'staff' && req.user.employee_id !== parseInt(employee_id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only clock in for yourself'
      });
    }

    // Validate employee exists
    const employee = await Employee.findByPk(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Check if already clocked in today
    const existingAttendance = await Attendance.findOne({
      where: {
        employee_id,
        date: today
      }
    });

    if (existingAttendance && existingAttendance.clock_in_time) {
      return res.status(409).json({
        success: false,
        message: 'You have already clocked in today',
        data: existingAttendance
      });
    }

    // If type is WFH, check if WFH is approved for today
    if (type === 'WFH') {
      const wfhApplication = await WFHApplication.findOne({
        where: {
          employee_id,
          date: today,
          status: 'Approved'
        }
      });

      if (!wfhApplication) {
        return res.status(403).json({
          success: false,
          message: 'You do not have an approved WFH application for today'
        });
      }
    }

    const clockInTime = new Date();

    // Check if late (assuming office hours start at 9:00 AM)
    const officeStartTime = new Date(clockInTime);
    officeStartTime.setHours(9, 0, 0, 0);
    const is_late = type === 'Office' && clockInTime > officeStartTime;

    // Calculate late minutes if late
    let late_minutes = null;
    if (is_late) {
      late_minutes = Math.floor((clockInTime - officeStartTime) / (1000 * 60));
    }

    // Create or update attendance record
    const [attendance, created] = await Attendance.upsert({
      employee_id,
      date: today,
      clock_in_time: clockInTime,
      type,
      location_lat,
      location_long,
      location_address,
      is_late,
      late_minutes,
      clock_out_time: null,
      total_hours: null
    }, {
      returning: true
    });

    logger.info(`Clock in recorded for employee ${employee_id}`, {
      user_id: req.user.id,
      type,
      is_late
    });

    res.status(200).json({
      success: true,
      message: `Clocked in successfully${is_late ? ' (Late)' : ''}`,
      data: attendance
    });
  } catch (error) {
    logger.error('Error clocking in:', error);
    next(error);
  }
};

/**
 * Clock out
 */
exports.clockOut = async (req, res, next) => {
  try {
    const {
      employee_id,
      location_lat,
      location_long,
      location_address
    } = req.body;

    // Staff can only clock out for themselves
    if (req.user.role === 'staff' && req.user.employee_id !== parseInt(employee_id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only clock out for yourself'
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Find today's attendance record
    const attendance = await Attendance.findOne({
      where: {
        employee_id,
        date: today
      }
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'You have not clocked in today'
      });
    }

    if (attendance.clock_out_time) {
      return res.status(409).json({
        success: false,
        message: 'You have already clocked out today',
        data: attendance
      });
    }

    const clockOutTime = new Date();

    // Calculate total hours
    const clockInTime = new Date(attendance.clock_in_time);
    const totalHours = ((clockOutTime - clockInTime) / (1000 * 60 * 60)).toFixed(2);

    // Check if early leave (assuming office hours end at 6:00 PM)
    const officeEndTime = new Date(clockOutTime);
    officeEndTime.setHours(18, 0, 0, 0);
    const is_early_leave = attendance.type === 'Office' && clockOutTime < officeEndTime;

    // Calculate early leave minutes if early leave
    let early_leave_minutes = null;
    if (is_early_leave) {
      early_leave_minutes = Math.floor((officeEndTime - clockOutTime) / (1000 * 60));
    }

    // Update attendance record
    await attendance.update({
      clock_out_time: clockOutTime,
      total_hours: totalHours,
      is_early_leave,
      early_leave_minutes,
      location_lat: location_lat || attendance.location_lat,
      location_long: location_long || attendance.location_long,
      location_address: location_address || attendance.location_address
    });

    logger.info(`Clock out recorded for employee ${employee_id}`, {
      user_id: req.user.id,
      total_hours: totalHours,
      is_early_leave
    });

    res.status(200).json({
      success: true,
      message: `Clocked out successfully${is_early_leave ? ' (Early Leave)' : ''}`,
      data: attendance
    });
  } catch (error) {
    logger.error('Error clocking out:', error);
    next(error);
  }
};

/**
 * Get attendance records with pagination and filtering
 */
exports.getAllAttendance = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      employee_id,
      type,
      start_date,
      end_date,
      is_late,
      is_early_leave
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    // Apply filters
    if (employee_id) where.employee_id = employee_id;
    if (type) where.type = type;
    if (is_late !== undefined) where.is_late = is_late === 'true';
    if (is_early_leave !== undefined) where.is_early_leave = is_early_leave === 'true';
    if (start_date && end_date) {
      where.date = { [Op.between]: [start_date, end_date] };
    }

    // Staff can only view their own attendance
    if (req.user.role === 'staff') {
      where.employee_id = req.user.employee_id;
    }

    const { count, rows } = await Attendance.findAndCountAll({
      where,
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department', 'position']
        }
      ],
      limit: parseInt(limit),
      offset: offset,
      order: [['date', 'DESC'], ['clock_in_time', 'DESC']]
    });

    logger.info(`Retrieved ${rows.length} attendance records`, {
      user_id: req.user.id,
      filters: where
    });

    res.status(200).json({
      success: true,
      data: {
        attendance: rows,
        pagination: {
          total: count,
          currentPage: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching attendance:', error);
    next(error);
  }
};

/**
 * Get attendance by ID
 */
exports.getAttendanceById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const attendance = await Attendance.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department', 'position']
        }
      ]
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    // Staff can only view their own attendance
    if (req.user.role === 'staff' && req.user.employee_id !== attendance.employee_id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this attendance record'
      });
    }

    logger.info(`Retrieved attendance ${id}`, { user_id: req.user.id });

    res.status(200).json({
      success: true,
      data: attendance
    });
  } catch (error) {
    logger.error(`Error fetching attendance ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Update attendance record (admin only - for manual adjustments)
 */
exports.updateAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      clock_in_time,
      clock_out_time,
      type,
      remarks
    } = req.body;

    const attendance = await Attendance.findByPk(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    // Recalculate total hours if times are updated
    let total_hours = attendance.total_hours;
    if (clock_in_time && clock_out_time) {
      const clockIn = new Date(clock_in_time);
      const clockOut = new Date(clock_out_time);
      total_hours = ((clockOut - clockIn) / (1000 * 60 * 60)).toFixed(2);
    }

    // Update attendance
    await attendance.update({
      clock_in_time: clock_in_time || attendance.clock_in_time,
      clock_out_time: clock_out_time !== undefined ? clock_out_time : attendance.clock_out_time,
      total_hours,
      type: type || attendance.type,
      remarks: remarks !== undefined ? remarks : attendance.remarks
    });

    logger.info(`Attendance updated: ${id}`, {
      user_id: req.user.id,
      remarks: 'Manual adjustment'
    });

    res.status(200).json({
      success: true,
      message: 'Attendance record updated successfully',
      data: attendance
    });
  } catch (error) {
    logger.error(`Error updating attendance ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Delete attendance record (admin only)
 */
exports.deleteAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;

    const attendance = await Attendance.findByPk(id);

    if (!attendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    await attendance.destroy();

    logger.info(`Attendance deleted: ${id}`, { user_id: req.user.id });

    res.status(200).json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting attendance ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Apply for WFH
 */
exports.applyWFH = async (req, res, next) => {
  try {
    const {
      employee_id,
      date,
      reason
    } = req.body;

    // Staff can only apply for themselves
    if (req.user.role === 'staff' && req.user.employee_id !== parseInt(employee_id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only apply WFH for yourself'
      });
    }

    // Validate employee exists
    const employee = await Employee.findByPk(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check if WFH application already exists for this date
    const existingApplication = await WFHApplication.findOne({
      where: {
        employee_id,
        date,
        status: { [Op.in]: ['Pending', 'Approved'] }
      }
    });

    if (existingApplication) {
      return res.status(409).json({
        success: false,
        message: 'You already have a WFH application for this date'
      });
    }

    // Create WFH application
    const wfhApplication = await WFHApplication.create({
      employee_id,
      date,
      reason,
      status: 'Pending'
    });

    // Fetch with associations
    const createdWFH = await WFHApplication.findByPk(wfhApplication.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department']
        }
      ]
    });

    logger.info(`WFH application created: ${wfhApplication.id}`, {
      user_id: req.user.id,
      employee_id,
      date
    });

    res.status(201).json({
      success: true,
      message: 'WFH application submitted successfully',
      data: createdWFH
    });
  } catch (error) {
    logger.error('Error applying for WFH:', error);
    next(error);
  }
};

/**
 * Get all WFH applications
 */
exports.getAllWFH = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      employee_id,
      start_date,
      end_date
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    // Apply filters
    if (status) where.status = status;
    if (employee_id) where.employee_id = employee_id;
    if (start_date && end_date) {
      where.date = { [Op.between]: [start_date, end_date] };
    }

    // Staff can only view their own WFH applications
    if (req.user.role === 'staff') {
      where.employee_id = req.user.employee_id;
    }

    const { count, rows } = await WFHApplication.findAndCountAll({
      where,
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department', 'position']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'email', 'role']
        }
      ],
      limit: parseInt(limit),
      offset: offset,
      order: [['date', 'DESC']]
    });

    logger.info(`Retrieved ${rows.length} WFH applications`, {
      user_id: req.user.id,
      filters: where
    });

    res.status(200).json({
      success: true,
      data: {
        wfh_applications: rows,
        pagination: {
          total: count,
          currentPage: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching WFH applications:', error);
    next(error);
  }
};

/**
 * Approve or reject WFH application
 */
exports.approveRejectWFH = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, rejection_reason } = req.body; // action: 'approve' or 'reject'

    const wfhApplication = await WFHApplication.findByPk(id);

    if (!wfhApplication) {
      return res.status(404).json({
        success: false,
        message: 'WFH application not found'
      });
    }

    // Only pending applications can be approved/rejected
    if (wfhApplication.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot ${action} WFH application with status ${wfhApplication.status}`
      });
    }

    // Only admin or manager can approve/reject
    if (req.user.role === 'staff') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to approve/reject WFH applications'
      });
    }

    if (action === 'approve') {
      await wfhApplication.update({
        status: 'Approved',
        approved_by: req.user.id,
        approved_at: new Date()
      });

      logger.info(`WFH application approved: ${id}`, { user_id: req.user.id });
    } else if (action === 'reject') {
      if (!rejection_reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      await wfhApplication.update({
        status: 'Rejected',
        approved_by: req.user.id,
        approved_at: new Date(),
        rejection_reason
      });

      logger.info(`WFH application rejected: ${id}`, { user_id: req.user.id });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approve" or "reject"'
      });
    }

    // Fetch updated WFH application
    const updatedWFH = await WFHApplication.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'department']
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
      message: `WFH application ${action}d successfully`,
      data: updatedWFH
    });
  } catch (error) {
    logger.error(`Error ${req.body.action}ing WFH application ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Get attendance summary for an employee
 */
exports.getAttendanceSummary = async (req, res, next) => {
  try {
    const { employee_id } = req.params;
    const { month, year } = req.query;

    // Staff can only view their own summary
    if (req.user.role === 'staff' && req.user.employee_id !== parseInt(employee_id)) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own attendance summary'
      });
    }

    const employee = await Employee.findByPk(employee_id, {
      attributes: ['id', 'employee_id', 'full_name', 'department']
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetMonth = month || (currentDate.getMonth() + 1);

    // Get first and last day of the month
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);

    const attendanceRecords = await Attendance.findAll({
      where: {
        employee_id,
        date: {
          [Op.between]: [
            startDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
          ]
        }
      },
      order: [['date', 'ASC']]
    });

    // Calculate summary statistics
    const summary = {
      total_working_days: attendanceRecords.length,
      total_hours: 0,
      office_days: 0,
      wfh_days: 0,
      late_count: 0,
      early_leave_count: 0,
      records: []
    };

    attendanceRecords.forEach(record => {
      summary.total_hours += parseFloat(record.total_hours || 0);
      if (record.type === 'Office') summary.office_days++;
      if (record.type === 'WFH') summary.wfh_days++;
      if (record.is_late) summary.late_count++;
      if (record.is_early_leave) summary.early_leave_count++;

      summary.records.push({
        date: record.date,
        clock_in_time: record.clock_in_time,
        clock_out_time: record.clock_out_time,
        total_hours: parseFloat(record.total_hours || 0),
        type: record.type,
        is_late: record.is_late,
        is_early_leave: record.is_early_leave
      });
    });

    summary.total_hours = summary.total_hours.toFixed(2);

    logger.info(`Retrieved attendance summary for employee ${employee_id}`, {
      user_id: req.user.id,
      month: targetMonth,
      year: targetYear
    });

    res.status(200).json({
      success: true,
      data: {
        employee,
        period: {
          month: parseInt(targetMonth),
          year: parseInt(targetYear)
        },
        summary
      }
    });
  } catch (error) {
    logger.error(`Error fetching attendance summary for employee ${req.params.employee_id}:`, error);
    next(error);
  }
};
