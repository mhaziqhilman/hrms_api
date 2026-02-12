const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const YTDStatutory = require('../models/YTDStatutory');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const { calculateAllStatutory } = require('../utils/statutoryCalculations');

/**
 * Get all payroll records with pagination and filtering
 */
exports.getAllPayroll = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      year,
      month,
      employee_id,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};
    const includeWhere = {};

    if (status) where.status = status;
    if (year) where.year = parseInt(year);
    if (month) where.month = parseInt(month);
    if (employee_id) where.employee_id = parseInt(employee_id);

    // Add search functionality for employee name or employee_id
    let hasSearch = false;
    if (search) {
      includeWhere[Op.or] = [
        { full_name: { [Op.like]: `%${search}%` } },
        { employee_id: { [Op.like]: `%${search}%` } }
      ];
      hasSearch = true;
    }

    // Always filter by active company through employee
    const employeeWhere = { company_id: req.user.company_id };
    if (hasSearch) {
      Object.assign(employeeWhere, includeWhere);
    }

    const { count, rows } = await Payroll.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['year', 'DESC'], ['month', 'DESC'], ['created_at', 'DESC']],
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'employee_id', 'full_name', 'position', 'department'],
          where: employeeWhere,
          required: true
        }
      ],
      distinct: true // Fix count when using INNER JOIN
    });

    logger.info(`Retrieved ${rows.length} payroll records`, {
      user_id: req.user.id,
      filters: { status, year, month, employee_id, search }
    });

    res.status(200).json({
      success: true,
      data: {
        payrolls: rows,
        pagination: {
          total: count,
          currentPage: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching payroll records:', error);
    next(error);
  }
};

/**
 * Get single payroll record by ID
 */
exports.getPayrollById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: { exclude: ['user_id'] },
          where: { company_id: req.user.company_id },
          required: true
        }
      ]
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Check permissions
    if (req.user.role === 'Staff' && req.user.employee_id !== payroll.employee_id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this payroll record'
      });
    }

    logger.info(`Payroll record ${id} retrieved by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      data: payroll
    });
  } catch (error) {
    logger.error(`Error fetching payroll ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Calculate and create payroll for an employee
 */
exports.calculatePayroll = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      employee_id,
      year,
      month,
      basic_salary: form_basic_salary,
      allowances = 0,
      overtime_pay = 0,
      bonus = 0,
      commission = 0,
      unpaid_leave_deduction = 0,
      other_deductions = 0,
      payment_date,
      notes
    } = req.body;

    // Validate employee belongs to active company
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

    if (employee.employment_status !== 'Active') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot create payroll for inactive employee'
      });
    }

    // Check if payroll already exists for this employee/month/year
    const existing = await Payroll.findOne({
      where: { employee_id, year, month }
    });

    if (existing) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Payroll for this employee and period already exists'
      });
    }

    // Calculate pay period
    const pay_period_start = new Date(year, month - 1, 1);
    const pay_period_end = new Date(year, month, 0);

    // Calculate gross salary
    const basic_salary = form_basic_salary != null ? parseFloat(form_basic_salary) : parseFloat(employee.basic_salary);
    const gross_salary = basic_salary +
                        parseFloat(allowances) +
                        parseFloat(overtime_pay) +
                        parseFloat(bonus) +
                        parseFloat(commission);

    // Fetch YTD data from previous payroll records for PCB calculation
    const previousPayrolls = await Payroll.findAll({
      where: {
        employee_id,
        year,
        month: { [Op.lt]: month },
        status: { [Op.notIn]: ['Cancelled'] }
      },
      attributes: ['gross_salary', 'epf_employee', 'pcb_deduction'],
      raw: true
    });

    const ytdGross = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.gross_salary || 0), 0);
    const ytdEpf = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.epf_employee || 0), 0);
    const ytdPcbDeducted = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.pcb_deduction || 0), 0);

    // Calculate statutory deductions with employee profile and YTD data
    const statutory = calculateAllStatutory(gross_salary, {
      employee: {
        tax_category: employee.tax_category || 'KA',
        number_of_children: employee.number_of_children || 0,
        children_in_higher_education: employee.children_in_higher_education || 0,
        disabled_children: employee.disabled_children || 0,
        disabled_self: employee.disabled_self || false,
        disabled_spouse: employee.disabled_spouse || false
      },
      ytd: {
        gross: ytdGross,
        epf: ytdEpf,
        pcbDeducted: ytdPcbDeducted,
        zakat: 0
      },
      currentMonth: month,
      additionalRemuneration: parseFloat(bonus) + parseFloat(commission)
    });

    // Calculate total deductions
    const total_deductions = statutory.totalEmployeeDeduction +
                            parseFloat(unpaid_leave_deduction) +
                            parseFloat(other_deductions);

    // Calculate net salary
    const net_salary = gross_salary - total_deductions;

    // Create payroll record
    const payroll = await Payroll.create({
      employee_id,
      pay_period_start,
      pay_period_end,
      payment_date: payment_date || new Date(year, month, 25), // Default to 25th of next month
      month,
      year,
      basic_salary,
      allowances,
      overtime_pay,
      bonus,
      commission,
      gross_salary,
      epf_employee: statutory.epf.employee,
      epf_employer: statutory.epf.employer,
      socso_employee: statutory.socso.employee,
      socso_employer: statutory.socso.employer,
      eis_employee: statutory.eis.employee,
      eis_employer: statutory.eis.employer,
      pcb_deduction: statutory.pcb,
      unpaid_leave_deduction,
      other_deductions,
      total_deductions,
      net_salary,
      status: 'Draft',
      notes,
      processed_by: req.user.id
    }, { transaction });

    // Update or create YTD Statutory record
    await updateYTDStatutory(employee_id, year, month, statutory, gross_salary, net_salary, transaction);

    await transaction.commit();

    logger.info(`Payroll calculated for employee ${employee_id}, ${month}/${year}`, {
      payroll_id: payroll.id,
      processed_by: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Payroll calculated successfully',
      data: payroll
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error calculating payroll:', error);
    next(error);
  }
};

/**
 * Update payroll record
 */
exports.updatePayroll = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    const updates = req.body;

    const payroll = await Payroll.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });

    if (!payroll) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Cannot update if already paid
    if (payroll.status === 'Paid') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot update paid payroll'
      });
    }

    // Recalculate if salary components changed
    if (updates.allowances !== undefined || updates.overtime_pay !== undefined ||
        updates.bonus !== undefined || updates.commission !== undefined ||
        updates.unpaid_leave_deduction !== undefined || updates.other_deductions !== undefined) {

      const basic_salary = updates.basic_salary || payroll.basic_salary;
      const currentBonus = parseFloat(updates.bonus ?? payroll.bonus);
      const currentCommission = parseFloat(updates.commission ?? payroll.commission);
      const gross_salary = parseFloat(basic_salary) +
                          parseFloat(updates.allowances ?? payroll.allowances) +
                          parseFloat(updates.overtime_pay ?? payroll.overtime_pay) +
                          currentBonus +
                          currentCommission;

      // Fetch employee data for PCB calculation
      const employee = await Employee.findByPk(payroll.employee_id);

      // Fetch YTD data from previous payroll records
      const previousPayrolls = await Payroll.findAll({
        where: {
          employee_id: payroll.employee_id,
          year: payroll.year,
          month: { [Op.lt]: payroll.month },
          status: { [Op.notIn]: ['Cancelled'] }
        },
        attributes: ['gross_salary', 'epf_employee', 'pcb_deduction'],
        raw: true
      });

      const ytdGross = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.gross_salary || 0), 0);
      const ytdEpf = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.epf_employee || 0), 0);
      const ytdPcbDeducted = previousPayrolls.reduce((sum, p) => sum + parseFloat(p.pcb_deduction || 0), 0);

      const statutory = calculateAllStatutory(gross_salary, {
        employee: {
          tax_category: employee?.tax_category || 'KA',
          number_of_children: employee?.number_of_children || 0,
          children_in_higher_education: employee?.children_in_higher_education || 0,
          disabled_children: employee?.disabled_children || 0,
          disabled_self: employee?.disabled_self || false,
          disabled_spouse: employee?.disabled_spouse || false
        },
        ytd: {
          gross: ytdGross,
          epf: ytdEpf,
          pcbDeducted: ytdPcbDeducted,
          zakat: 0
        },
        currentMonth: payroll.month,
        additionalRemuneration: currentBonus + currentCommission
      });

      const total_deductions = statutory.totalEmployeeDeduction +
                              parseFloat(updates.unpaid_leave_deduction ?? payroll.unpaid_leave_deduction) +
                              parseFloat(updates.other_deductions ?? payroll.other_deductions);

      updates.gross_salary = gross_salary;
      updates.epf_employee = statutory.epf.employee;
      updates.epf_employer = statutory.epf.employer;
      updates.socso_employee = statutory.socso.employee;
      updates.socso_employer = statutory.socso.employer;
      updates.eis_employee = statutory.eis.employee;
      updates.eis_employer = statutory.eis.employer;
      updates.pcb_deduction = statutory.pcb;
      updates.total_deductions = total_deductions;
      updates.net_salary = gross_salary - total_deductions;
    }

    await payroll.update(updates, { transaction });
    await transaction.commit();

    logger.info(`Payroll ${id} updated by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Payroll updated successfully',
      data: payroll
    });
  } catch (error) {
    await transaction.rollback();
    logger.error(`Error updating payroll ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Submit payroll for approval (Draft -> Pending)
 */
exports.submitForApproval = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    if (payroll.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft payroll can be submitted for approval'
      });
    }

    await payroll.update({
      status: 'Pending',
      submitted_by: req.user.id,
      submitted_at: new Date()
    });

    logger.info(`Payroll ${id} submitted for approval by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Payroll submitted for approval successfully',
      data: payroll
    });
  } catch (error) {
    logger.error(`Error submitting payroll for approval ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Approve payroll (Pending -> Approved)
 */
exports.approvePayroll = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    if (payroll.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending payroll can be approved'
      });
    }

    await payroll.update({
      status: 'Approved',
      approved_by: req.user.id,
      approved_at: new Date()
    });

    logger.info(`Payroll ${id} approved by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Payroll approved successfully',
      data: payroll
    });
  } catch (error) {
    logger.error(`Error approving payroll ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Mark payroll as paid
 */
exports.markAsPaid = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    if (payroll.status !== 'Approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved payroll can be marked as paid'
      });
    }

    await payroll.update({ status: 'Paid' });

    logger.info(`Payroll ${id} marked as paid by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Payroll marked as paid successfully',
      data: payroll
    });
  } catch (error) {
    logger.error(`Error marking payroll as paid ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Delete/Cancel payroll
 */
exports.deletePayroll = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    if (payroll.status === 'Paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete paid payroll'
      });
    }

    await payroll.update({ status: 'Cancelled' });

    logger.info(`Payroll ${id} cancelled by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Payroll cancelled successfully'
    });
  } catch (error) {
    logger.error(`Error deleting payroll ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Permanently delete a cancelled payroll record
 */
exports.permanentDeletePayroll = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    if (payroll.status !== 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Only cancelled payroll records can be permanently deleted'
      });
    }

    await payroll.destroy();

    logger.info(`Payroll ${id} permanently deleted by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      message: 'Payroll permanently deleted successfully'
    });
  } catch (error) {
    logger.error(`Error permanently deleting payroll ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Generate payslip for a specific payroll record
 */
exports.generatePayslip = async (req, res, next) => {
  try {
    const { id } = req.params;

    const payroll = await Payroll.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: [
            'id', 'employee_id', 'full_name', 'ic_no',
            'position', 'department', 'bank_name',
            'bank_account_no', 'epf_no', 'socso_no', 'tax_no'
          ],
          where: { company_id: req.user.company_id },
          required: true
        }
      ]
    });

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Check permissions
    if (req.user.role === 'Staff' && req.user.employee_id !== payroll.employee_id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this payslip'
      });
    }

    // Format payslip data
    const payslip = {
      payroll_id: payroll.id,
      employee: {
        id: payroll.employee.id,
        employee_id: payroll.employee.employee_id,
        full_name: payroll.employee.full_name,
        ic_no: payroll.employee.ic_no,
        position: payroll.employee.position,
        department: payroll.employee.department,
        epf_no: payroll.employee.epf_no,
        socso_no: payroll.employee.socso_no,
        tax_no: payroll.employee.tax_no
      },
      pay_period: {
        month: payroll.month,
        year: payroll.year,
        start_date: payroll.pay_period_start,
        end_date: payroll.pay_period_end,
        payment_date: payroll.payment_date
      },
      earnings: {
        basic_salary: parseFloat(payroll.basic_salary),
        allowances: parseFloat(payroll.allowances),
        overtime_pay: parseFloat(payroll.overtime_pay),
        bonus: parseFloat(payroll.bonus),
        commission: parseFloat(payroll.commission),
        gross_salary: parseFloat(payroll.gross_salary)
      },
      deductions: {
        epf_employee: parseFloat(payroll.epf_employee),
        socso_employee: parseFloat(payroll.socso_employee),
        eis_employee: parseFloat(payroll.eis_employee),
        pcb_deduction: parseFloat(payroll.pcb_deduction),
        unpaid_leave_deduction: parseFloat(payroll.unpaid_leave_deduction),
        other_deductions: parseFloat(payroll.other_deductions),
        total_deductions: parseFloat(payroll.total_deductions)
      },
      employer_contributions: {
        epf_employer: parseFloat(payroll.epf_employer),
        socso_employer: parseFloat(payroll.socso_employer),
        eis_employer: parseFloat(payroll.eis_employer)
      },
      net_salary: parseFloat(payroll.net_salary),
      bank_details: {
        bank_name: payroll.employee.bank_name,
        account_no: payroll.employee.bank_account_no
      },
      status: payroll.status,
      notes: payroll.notes,
      generated_at: new Date().toISOString()
    };

    logger.info(`Payslip generated for payroll ${id}`, {
      user_id: req.user.id,
      employee_id: payroll.employee_id
    });

    res.status(200).json({
      success: true,
      data: payslip
    });
  } catch (error) {
    logger.error(`Error generating payslip for payroll ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Helper function to update YTD Statutory records
 */
async function updateYTDStatutory(employee_id, year, month, statutory, gross_salary, net_salary, transaction) {
  const [ytdRecord, created] = await YTDStatutory.findOrCreate({
    where: { employee_id, year, month },
    defaults: {
      employee_id,
      year,
      month,
      gross_salary: 0,
      net_salary: 0,
      employee_epf: 0,
      employer_epf: 0,
      employee_socso: 0,
      employer_socso: 0,
      employee_eis: 0,
      employer_eis: 0,
      pcb_deduction: 0,
      ytd_gross: 0,
      ytd_net: 0,
      ytd_employee_epf: 0,
      ytd_employer_epf: 0,
      ytd_employee_socso: 0,
      ytd_employer_socso: 0,
      ytd_employee_eis: 0,
      ytd_employer_eis: 0,
      ytd_pcb: 0
    },
    transaction
  });

  // Calculate YTD totals (sum all records up to current month)
  const ytdRecords = await YTDStatutory.findAll({
    where: {
      employee_id,
      year,
      month: { [Op.lte]: month }
    },
    transaction
  });

  let ytdTotals = {
    ytd_gross: 0,
    ytd_net: 0,
    ytd_employee_epf: 0,
    ytd_employer_epf: 0,
    ytd_employee_socso: 0,
    ytd_employer_socso: 0,
    ytd_employee_eis: 0,
    ytd_employer_eis: 0,
    ytd_pcb: 0
  };

  ytdRecords.forEach(record => {
    if (record.month !== month) {
      ytdTotals.ytd_gross += parseFloat(record.gross_salary);
      ytdTotals.ytd_net += parseFloat(record.net_salary);
      ytdTotals.ytd_employee_epf += parseFloat(record.employee_epf);
      ytdTotals.ytd_employer_epf += parseFloat(record.employer_epf);
      ytdTotals.ytd_employee_socso += parseFloat(record.employee_socso);
      ytdTotals.ytd_employer_socso += parseFloat(record.employer_socso);
      ytdTotals.ytd_employee_eis += parseFloat(record.employee_eis);
      ytdTotals.ytd_employer_eis += parseFloat(record.employer_eis);
      ytdTotals.ytd_pcb += parseFloat(record.pcb_deduction);
    }
  });

  // Update current month record with YTD totals
  await ytdRecord.update({
    gross_salary,
    net_salary,
    employee_epf: statutory.epf.employee,
    employer_epf: statutory.epf.employer,
    employee_socso: statutory.socso.employee,
    employer_socso: statutory.socso.employer,
    employee_eis: statutory.eis.employee,
    employer_eis: statutory.eis.employer,
    pcb_deduction: statutory.pcb,
    ytd_gross: ytdTotals.ytd_gross + gross_salary,
    ytd_net: ytdTotals.ytd_net + net_salary,
    ytd_employee_epf: ytdTotals.ytd_employee_epf + statutory.epf.employee,
    ytd_employer_epf: ytdTotals.ytd_employer_epf + statutory.epf.employer,
    ytd_employee_socso: ytdTotals.ytd_employee_socso + statutory.socso.employee,
    ytd_employer_socso: ytdTotals.ytd_employer_socso + statutory.socso.employer,
    ytd_employee_eis: ytdTotals.ytd_employee_eis + statutory.eis.employee,
    ytd_employer_eis: ytdTotals.ytd_employer_eis + statutory.eis.employer,
    ytd_pcb: ytdTotals.ytd_pcb + statutory.pcb
  }, { transaction });
}

/**
 * Get my payslips (for authenticated employee)
 */
exports.getMyPayslips = async (req, res, next) => {
  try {
    const employeeId = req.user.employee_id;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'No employee profile linked to this account'
      });
    }

    const { page = 1, limit = 12, year } = req.query;
    const offset = (page - 1) * limit;

    const where = {
      employee_id: employeeId,
      status: { [Op.in]: ['Approved', 'Paid'] }
    };

    if (year) {
      where.year = parseInt(year);
    }

    const { count, rows } = await Payroll.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['year', 'DESC'], ['month', 'DESC']],
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'employee_id', 'full_name', 'position', 'department']
      }]
    });

    // Calculate YTD summary
    const currentYear = new Date().getFullYear();
    const ytdData = await Payroll.findAll({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('gross_salary')), 'total_gross'],
        [sequelize.fn('SUM', sequelize.col('net_salary')), 'total_net'],
        [sequelize.fn('SUM', sequelize.col('epf_employee')), 'total_epf'],
        [sequelize.fn('SUM', sequelize.col('socso_employee')), 'total_socso'],
        [sequelize.fn('SUM', sequelize.col('eis_employee')), 'total_eis'],
        [sequelize.fn('SUM', sequelize.col('pcb_deduction')), 'total_pcb']
      ],
      where: {
        employee_id: employeeId,
        year: currentYear,
        status: { [Op.in]: ['Approved', 'Paid'] }
      },
      raw: true
    });

    const ytdSummary = ytdData[0] || {};

    logger.info(`My payslips retrieved for employee ${employeeId}`, {
      user_id: req.user.id,
      count: rows.length
    });

    res.status(200).json({
      success: true,
      data: {
        payslips: rows,
        ytd_summary: {
          year: currentYear,
          total_gross: parseFloat(ytdSummary.total_gross || 0),
          total_net: parseFloat(ytdSummary.total_net || 0),
          total_epf: parseFloat(ytdSummary.total_epf || 0),
          total_socso: parseFloat(ytdSummary.total_socso || 0),
          total_eis: parseFloat(ytdSummary.total_eis || 0),
          total_pcb: parseFloat(ytdSummary.total_pcb || 0)
        },
        pagination: {
          total: count,
          currentPage: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching my payslips:', error);
    next(error);
  }
};

/**
 * Bulk submit payrolls for approval (Draft -> Pending)
 */
exports.bulkSubmitForApproval = async (req, res, next) => {
  try {
    const { payroll_ids } = req.body;

    const payrolls = await Payroll.findAll({
      where: { id: { [Op.in]: payroll_ids } },
      include: [{
        model: Employee,
        as: 'employee',
        where: { company_id: req.user.company_id },
        attributes: ['id', 'full_name'],
        required: true
      }]
    });

    const foundIds = new Set(payrolls.map(p => p.id));
    const results = [];

    for (const id of payroll_ids) {
      if (!foundIds.has(id)) {
        results.push({ id, success: false, message: 'Payroll record not found' });
      }
    }

    for (const payroll of payrolls) {
      try {
        if (payroll.status !== 'Draft') {
          results.push({ id: payroll.id, success: false, message: `Cannot submit: status is '${payroll.status}', expected 'Draft'` });
          continue;
        }
        await payroll.update({ status: 'Pending', submitted_by: req.user.id, submitted_at: new Date() });
        results.push({ id: payroll.id, success: true, message: 'Submitted for approval' });
      } catch (error) {
        results.push({ id: payroll.id, success: false, message: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info(`Bulk submit: ${successCount} succeeded, ${failCount} failed`, { user_id: req.user.id, payroll_ids });

    res.status(200).json({
      success: true,
      message: `Bulk submit completed: ${successCount} succeeded, ${failCount} failed`,
      data: { successCount, failCount, results }
    });
  } catch (error) {
    logger.error('Error bulk submitting payrolls:', error);
    next(error);
  }
};

/**
 * Bulk approve payrolls (Pending -> Approved)
 */
exports.bulkApprovePayroll = async (req, res, next) => {
  try {
    const { payroll_ids } = req.body;

    const payrolls = await Payroll.findAll({
      where: { id: { [Op.in]: payroll_ids } },
      include: [{
        model: Employee,
        as: 'employee',
        where: { company_id: req.user.company_id },
        attributes: ['id', 'full_name'],
        required: true
      }]
    });

    const foundIds = new Set(payrolls.map(p => p.id));
    const results = [];

    for (const id of payroll_ids) {
      if (!foundIds.has(id)) {
        results.push({ id, success: false, message: 'Payroll record not found' });
      }
    }

    for (const payroll of payrolls) {
      try {
        if (payroll.status !== 'Pending') {
          results.push({ id: payroll.id, success: false, message: `Cannot approve: status is '${payroll.status}', expected 'Pending'` });
          continue;
        }
        await payroll.update({ status: 'Approved', approved_by: req.user.id, approved_at: new Date() });
        results.push({ id: payroll.id, success: true, message: 'Approved successfully' });
      } catch (error) {
        results.push({ id: payroll.id, success: false, message: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info(`Bulk approve: ${successCount} succeeded, ${failCount} failed`, { user_id: req.user.id, payroll_ids });

    res.status(200).json({
      success: true,
      message: `Bulk approve completed: ${successCount} succeeded, ${failCount} failed`,
      data: { successCount, failCount, results }
    });
  } catch (error) {
    logger.error('Error bulk approving payrolls:', error);
    next(error);
  }
};

/**
 * Bulk mark payrolls as paid (Approved -> Paid)
 */
exports.bulkMarkAsPaid = async (req, res, next) => {
  try {
    const { payroll_ids } = req.body;

    const payrolls = await Payroll.findAll({
      where: { id: { [Op.in]: payroll_ids } },
      include: [{
        model: Employee,
        as: 'employee',
        where: { company_id: req.user.company_id },
        attributes: ['id', 'full_name'],
        required: true
      }]
    });

    const foundIds = new Set(payrolls.map(p => p.id));
    const results = [];

    for (const id of payroll_ids) {
      if (!foundIds.has(id)) {
        results.push({ id, success: false, message: 'Payroll record not found' });
      }
    }

    for (const payroll of payrolls) {
      try {
        if (payroll.status !== 'Approved') {
          results.push({ id: payroll.id, success: false, message: `Cannot mark as paid: status is '${payroll.status}', expected 'Approved'` });
          continue;
        }
        await payroll.update({ status: 'Paid' });
        results.push({ id: payroll.id, success: true, message: 'Marked as paid' });
      } catch (error) {
        results.push({ id: payroll.id, success: false, message: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info(`Bulk mark paid: ${successCount} succeeded, ${failCount} failed`, { user_id: req.user.id, payroll_ids });

    res.status(200).json({
      success: true,
      message: `Bulk mark paid completed: ${successCount} succeeded, ${failCount} failed`,
      data: { successCount, failCount, results }
    });
  } catch (error) {
    logger.error('Error bulk marking payrolls as paid:', error);
    next(error);
  }
};

/**
 * Bulk cancel payrolls (Draft/Pending -> Cancelled)
 */
exports.bulkCancelPayroll = async (req, res, next) => {
  try {
    const { payroll_ids } = req.body;

    const payrolls = await Payroll.findAll({
      where: { id: { [Op.in]: payroll_ids } },
      include: [{
        model: Employee,
        as: 'employee',
        where: { company_id: req.user.company_id },
        attributes: ['id', 'full_name'],
        required: true
      }]
    });

    const foundIds = new Set(payrolls.map(p => p.id));
    const results = [];

    for (const id of payroll_ids) {
      if (!foundIds.has(id)) {
        results.push({ id, success: false, message: 'Payroll record not found' });
      }
    }

    for (const payroll of payrolls) {
      try {
        if (payroll.status === 'Paid') {
          results.push({ id: payroll.id, success: false, message: 'Cannot cancel paid payroll' });
          continue;
        }
        if (payroll.status === 'Cancelled') {
          results.push({ id: payroll.id, success: false, message: 'Payroll is already cancelled' });
          continue;
        }
        await payroll.update({ status: 'Cancelled' });
        results.push({ id: payroll.id, success: true, message: 'Cancelled successfully' });
      } catch (error) {
        results.push({ id: payroll.id, success: false, message: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info(`Bulk cancel: ${successCount} succeeded, ${failCount} failed`, { user_id: req.user.id, payroll_ids });

    res.status(200).json({
      success: true,
      message: `Bulk cancel completed: ${successCount} succeeded, ${failCount} failed`,
      data: { successCount, failCount, results }
    });
  } catch (error) {
    logger.error('Error bulk cancelling payrolls:', error);
    next(error);
  }
};

/**
 * Bulk permanently delete cancelled payrolls
 */
exports.bulkPermanentDeletePayroll = async (req, res, next) => {
  try {
    const { payroll_ids } = req.body;

    const payrolls = await Payroll.findAll({
      where: { id: { [Op.in]: payroll_ids } },
      include: [{
        model: Employee,
        as: 'employee',
        where: { company_id: req.user.company_id },
        attributes: ['id', 'full_name'],
        required: true
      }]
    });

    const foundIds = new Set(payrolls.map(p => p.id));
    const results = [];

    for (const id of payroll_ids) {
      if (!foundIds.has(id)) {
        results.push({ id, success: false, message: 'Payroll record not found' });
      }
    }

    for (const payroll of payrolls) {
      try {
        if (payroll.status !== 'Cancelled') {
          results.push({ id: payroll.id, success: false, message: `Cannot delete: status is '${payroll.status}', expected 'Cancelled'` });
          continue;
        }
        await payroll.destroy();
        results.push({ id: payroll.id, success: true, message: 'Permanently deleted' });
      } catch (error) {
        results.push({ id: payroll.id, success: false, message: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info(`Bulk delete: ${successCount} succeeded, ${failCount} failed`, { user_id: req.user.id, payroll_ids });

    res.status(200).json({
      success: true,
      message: `Bulk delete completed: ${successCount} succeeded, ${failCount} failed`,
      data: { successCount, failCount, results }
    });
  } catch (error) {
    logger.error('Error bulk deleting payrolls:', error);
    next(error);
  }
};

module.exports = exports;
