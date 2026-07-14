const { Op } = require('sequelize');
const Overtime = require('../models/Overtime');
const Employee = require('../models/Employee');
const User = require('../models/User');
const overtimeService = require('../services/overtimeService');
const notificationService = require('../services/notificationService');
const auditService = require('../services/auditService');
const logger = require('../utils/logger');

// Associations to include when returning an OT record
const includeAssociations = [
  { model: Employee, as: 'employee', attributes: ['id', 'full_name', 'employee_id', 'department'] },
  { model: User, as: 'approver', attributes: ['id', 'email', 'role'] }
];

// Resolve the Employee row for the acting user within the active company
async function getActingEmployee(req) {
  return Employee.findOne({
    where: { user_id: req.user.id, company_id: req.user.company_id }
  });
}

// Derive [year, month] from a YYYY-MM-DD date string
function periodFromDate(date) {
  const [y, m] = String(date).split('-').map(Number);
  return { period_year: y, period_month: m };
}

/**
 * Submit a new overtime request.
 * Amount is auto-computed from EA multipliers; day_type auto-detected when omitted.
 */
exports.submitOvertime = async (req, res) => {
  try {
    const { employee_id, date, hours, day_type, reason, source, attendance_id, start_time, end_time } = req.body;

    // Resolve target employee: explicit public_id, else the acting user's employee
    const employee = employee_id
      ? await Employee.findOne({ where: { public_id: employee_id, company_id: req.user.company_id } })
      : await getActingEmployee(req);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    // Staff may only submit for themselves
    if (req.user.role === 'staff' && employee.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only submit overtime for yourself' });
    }

    // Determine day type (auto-detect if not explicitly provided)
    const effectiveDayType = day_type || await overtimeService.detectDayType(req.user.company_id, date);

    // Compute snapshot amount from the employee's basic salary
    const { hourly_rate, multiplier, amount } = overtimeService.computeAmount(
      employee.basic_salary,
      hours,
      effectiveDayType
    );

    const { period_year, period_month } = periodFromDate(date);

    const overtime = await Overtime.create({
      company_id: req.user.company_id,
      employee_id: employee.id,
      date,
      period_year,
      period_month,
      day_type: effectiveDayType,
      hours,
      start_time: start_time || null,
      end_time: end_time || null,
      multiplier,
      hourly_rate,
      amount,
      reason: reason || null,
      source: source === 'attendance' ? 'attendance' : 'manual',
      attendance_id: attendance_id || null,
      status: 'Pending'
    });

    // Notify the reporting manager (if any) that there is an OT request to review
    if (employee.reporting_manager_id) {
      const manager = await Employee.findByPk(employee.reporting_manager_id, { attributes: ['user_id'] });
      if (manager?.user_id) {
        notificationService.createNotification(
          manager.user_id,
          req.user.company_id,
          'overtime_submitted',
          'Overtime Request Submitted',
          `${employee.full_name} submitted an overtime request of RM${amount} for ${date}.`,
          { overtime_id: overtime.public_id, link: '/overtime/approval' }
        );
      }
    }

    auditService.log({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: 'overtime.submitted',
      entityType: 'Overtime',
      entityId: overtime.public_id || overtime.id,
      newValues: { employee_id: employee.id, date, hours, day_type: effectiveDayType, amount },
      req
    });

    const created = await Overtime.findByPk(overtime.id, { include: includeAssociations });
    res.status(201).json({ success: true, message: 'Overtime request submitted successfully', data: created });
  } catch (error) {
    logger.error('Error submitting overtime:', error);
    res.status(500).json({ success: false, message: 'Error submitting overtime', error: error.message });
  }
};

/**
 * List overtime requests.
 *  - staff  → own requests only
 *  - manager→ own + direct reports (reporting_manager_id)
 *  - admin  → all requests in the company
 */
exports.getAllOvertime = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, year, month, employee_id, sort = 'date', order = 'desc' } = req.query;

    const where = { company_id: req.user.company_id };
    if (status) where.status = status;
    if (year) where.period_year = Number(year);
    if (month) where.period_month = Number(month);

    // Role-based employee scoping
    const employeeWhere = { company_id: req.user.company_id };
    const actingEmployee = await getActingEmployee(req);

    if (req.user.role === 'staff') {
      if (!actingEmployee) {
        return res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: Number(limit), totalPages: 0 } });
      }
      where.employee_id = actingEmployee.id;
    } else if (req.user.role === 'manager') {
      const teamIds = actingEmployee
        ? (await Employee.findAll({
            where: { reporting_manager_id: actingEmployee.id, company_id: req.user.company_id },
            attributes: ['id']
          })).map(e => e.id)
        : [];
      if (actingEmployee) teamIds.push(actingEmployee.id);
      where.employee_id = teamIds.length ? { [Op.in]: teamIds } : -1;
    }

    // Optional filter by a specific employee (public_id)
    if (employee_id) {
      const target = await Employee.findOne({ where: { public_id: employee_id, company_id: req.user.company_id }, attributes: ['id'] });
      if (target) where.employee_id = target.id;
    }

    const sortField = ['date', 'amount', 'status', 'created_at'].includes(sort) ? sort : 'date';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows } = await Overtime.findAndCountAll({
      where,
      include: [
        { model: Employee, as: 'employee', where: employeeWhere, attributes: ['id', 'full_name', 'employee_id', 'department'] },
        { model: User, as: 'approver', attributes: ['id', 'email', 'role'] }
      ],
      order: [[sortField, sortOrder]],
      limit: Number(limit),
      offset,
      distinct: true
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching overtime requests:', error);
    res.status(500).json({ success: false, message: 'Error fetching overtime requests', error: error.message });
  }
};

/**
 * Pending overtime requests for the current manager's direct reports.
 */
exports.getTeamOvertime = async (req, res) => {
  try {
    const { status = 'Pending' } = req.query;
    const managerEmployee = await getActingEmployee(req);

    // super_admin/admin: return all matching in company; manager: direct reports only
    const where = { company_id: req.user.company_id };
    if (status && status !== 'All') where.status = status;

    if (req.user.role === 'manager') {
      if (!managerEmployee) return res.json({ success: true, data: [] });
      const reports = await Employee.findAll({
        where: { reporting_manager_id: managerEmployee.id, company_id: req.user.company_id },
        attributes: ['id']
      });
      const ids = reports.map(e => e.id);
      where.employee_id = ids.length ? { [Op.in]: ids } : -1;
    }

    const rows = await Overtime.findAll({
      where,
      include: includeAssociations,
      order: [['date', 'DESC']]
    });
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Error fetching team overtime:', error);
    res.status(500).json({ success: false, message: 'Error fetching team overtime', error: error.message });
  }
};

/**
 * Get a single overtime request by public_id (company-scoped).
 */
exports.getOvertimeById = async (req, res) => {
  try {
    const overtime = await Overtime.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id },
      include: includeAssociations
    });
    if (!overtime) {
      return res.status(404).json({ success: false, message: 'Overtime request not found' });
    }

    // Staff can only view their own
    if (req.user.role === 'staff') {
      const acting = await getActingEmployee(req);
      if (!acting || overtime.employee_id !== acting.id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    res.json({ success: true, data: overtime });
  } catch (error) {
    logger.error('Error fetching overtime:', error);
    res.status(500).json({ success: false, message: 'Error fetching overtime', error: error.message });
  }
};

/**
 * Update a pending overtime request (owner only). Recomputes the amount.
 */
exports.updateOvertime = async (req, res) => {
  try {
    const overtime = await Overtime.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });
    if (!overtime) {
      return res.status(404).json({ success: false, message: 'Overtime request not found' });
    }
    if (overtime.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Only pending overtime requests can be edited' });
    }

    const employee = await Employee.findByPk(overtime.employee_id);
    // Staff may only edit their own
    if (req.user.role === 'staff' && employee?.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You can only edit your own overtime' });
    }

    const { date, hours, day_type, reason, start_time, end_time } = req.body;
    if (date !== undefined) {
      overtime.date = date;
      const p = periodFromDate(date);
      overtime.period_year = p.period_year;
      overtime.period_month = p.period_month;
    }
    if (day_type !== undefined) overtime.day_type = day_type;
    if (hours !== undefined) overtime.hours = hours;
    if (reason !== undefined) overtime.reason = reason;
    if (start_time !== undefined) overtime.start_time = start_time || null;
    if (end_time !== undefined) overtime.end_time = end_time || null;

    // Recompute snapshot amount from current values
    const { hourly_rate, multiplier, amount } = overtimeService.computeAmount(
      employee.basic_salary,
      overtime.hours,
      overtime.day_type
    );
    overtime.hourly_rate = hourly_rate;
    overtime.multiplier = multiplier;
    overtime.amount = amount;

    await overtime.save();

    const updated = await Overtime.findByPk(overtime.id, { include: includeAssociations });
    res.json({ success: true, message: 'Overtime request updated', data: updated });
  } catch (error) {
    logger.error('Error updating overtime:', error);
    res.status(500).json({ success: false, message: 'Error updating overtime', error: error.message });
  }
};

/**
 * Delete a pending overtime request (owner or admin).
 */
exports.deleteOvertime = async (req, res) => {
  try {
    const overtime = await Overtime.findOne({
      where: { public_id: req.params.id, company_id: req.user.company_id }
    });
    if (!overtime) {
      return res.status(404).json({ success: false, message: 'Overtime request not found' });
    }

    const isAdmin = ['super_admin', 'admin'].includes(req.user.role);
    if (!isAdmin) {
      const employee = await Employee.findByPk(overtime.employee_id, { attributes: ['user_id'] });
      if (employee?.user_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      if (overtime.status !== 'Pending') {
        return res.status(400).json({ success: false, message: 'Only pending overtime requests can be deleted' });
      }
    }

    await overtime.destroy();
    res.json({ success: true, message: 'Overtime request deleted' });
  } catch (error) {
    logger.error('Error deleting overtime:', error);
    res.status(500).json({ success: false, message: 'Error deleting overtime', error: error.message });
  }
};

/**
 * Manager approve/reject an overtime request (single-level approval).
 */
exports.managerApproval = async (req, res) => {
  try {
    const { action, rejection_reason } = req.body; // 'approve' | 'reject'

    const overtime = await Overtime.findOne({
      where: { public_id: req.params.id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: ['id', 'user_id', 'full_name'] }]
    });
    if (!overtime) {
      return res.status(404).json({ success: false, message: 'Overtime request not found' });
    }
    if (overtime.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Only pending overtime requests can be approved or rejected' });
    }

    if (action === 'approve') {
      overtime.status = 'Approved';
      overtime.manager_approved_by = req.user.id;
      overtime.manager_approved_at = new Date();
      overtime.rejection_reason = null;
    } else if (action === 'reject') {
      if (!rejection_reason) {
        return res.status(400).json({ success: false, message: 'Rejection reason is required' });
      }
      overtime.status = 'Rejected';
      overtime.manager_approved_by = req.user.id;
      overtime.manager_approved_at = new Date();
      overtime.rejection_reason = rejection_reason;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action. Use "approve" or "reject"' });
    }

    await overtime.save();

    // Notify the requesting employee
    if (overtime.employee?.user_id) {
      const approved = action === 'approve';
      notificationService.createNotification(
        overtime.employee.user_id,
        req.user.company_id,
        approved ? 'overtime_approved' : 'overtime_rejected',
        approved ? 'Overtime Approved' : 'Overtime Rejected',
        approved
          ? `Your overtime of RM${overtime.amount} for ${overtime.date} has been approved.`
          : `Your overtime for ${overtime.date} was rejected.${rejection_reason ? ' Reason: ' + rejection_reason : ''}`,
        { overtime_id: overtime.public_id, link: '/overtime' }
      );
    }

    auditService.log({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: action === 'approve' ? 'overtime.manager_approved' : 'overtime.manager_rejected',
      entityType: 'Overtime',
      entityId: overtime.public_id || overtime.id,
      newValues: { status: overtime.status, rejection_reason: rejection_reason || null },
      req
    });

    const updated = await Overtime.findByPk(overtime.id, { include: includeAssociations });
    res.json({ success: true, message: `Overtime ${action === 'approve' ? 'approved' : 'rejected'} successfully`, data: updated });
  } catch (error) {
    logger.error('Error processing overtime approval:', error);
    res.status(500).json({ success: false, message: 'Error processing overtime approval', error: error.message });
  }
};

/**
 * Suggest the day type (and its multiplier) for a date — form helper.
 */
exports.suggestDayType = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date is required' });
    const dayType = await overtimeService.detectDayType(req.user.company_id, date);
    res.json({
      success: true,
      data: { date, day_type: dayType, multiplier: overtimeService.multiplierFor(dayType) }
    });
  } catch (error) {
    logger.error('Error suggesting day type:', error);
    res.status(500).json({ success: false, message: 'Error suggesting day type', error: error.message });
  }
};

/**
 * Suggest OT hours from a day's attendance record — form helper.
 * employee_id (public_id) optional; defaults to the acting employee.
 */
exports.suggestFromAttendance = async (req, res) => {
  try {
    const { date, employee_id } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date is required' });

    let employee;
    if (employee_id) {
      employee = await Employee.findOne({ where: { public_id: employee_id, company_id: req.user.company_id }, attributes: ['id'] });
    } else {
      employee = await getActingEmployee(req);
    }
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const result = await overtimeService.suggestHoursFromAttendance(employee.id, date);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error suggesting overtime from attendance:', error);
    res.status(500).json({ success: false, message: 'Error suggesting overtime from attendance', error: error.message });
  }
};

/**
 * Approved, unconsumed OT total for an employee + period — payroll UI helper.
 */
exports.getApprovedTotal = async (req, res) => {
  try {
    const { employee_id, year, month } = req.query;
    if (!employee_id || !year || !month) {
      return res.status(400).json({ success: false, message: 'employee_id, year and month are required' });
    }
    const employee = await Employee.findOne({ where: { public_id: employee_id, company_id: req.user.company_id }, attributes: ['id'] });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const total = await overtimeService.getApprovedOTTotal(employee.id, Number(year), Number(month), { unconsumedOnly: true });
    res.json({ success: true, data: { employee_id, year: Number(year), month: Number(month), total } });
  } catch (error) {
    logger.error('Error fetching approved overtime total:', error);
    res.status(500).json({ success: false, message: 'Error fetching approved overtime total', error: error.message });
  }
};
