const Employee = require('../models/Employee');
const YTDStatutory = require('../models/YTDStatutory');
const User = require('../models/User');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Get all employees with pagination and filtering
 */
exports.getAllEmployees = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      department,
      employment_type,
      search
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    // Filter by active company
    where.company_id = req.user.company_id;

    // Apply filters
    if (status) {
      where.employment_status = status;
    }

    if (department) {
      where.department = department;
    }

    if (employment_type) {
      where.employment_type = employment_type;
    }

    // Search by name, employee_id, ic_no, or email
    if (search) {
      where[Op.or] = [
        { full_name: { [Op.like]: `%${search}%` } },
        { employee_id: { [Op.like]: `%${search}%` } },
        { ic_no: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Employee.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      attributes: {
        exclude: ['user_id'] // Exclude sensitive fields
      }
    });

    logger.info(`Retrieved ${rows.length} employees`, {
      user_id: req.user.id,
      filters: { status, department, employment_type, search }
    });

    res.status(200).json({
      success: true,
      data: {
        employees: rows,
        pagination: {
          total: count,
          currentPage: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching employees:', error);
    next(error);
  }
};

/**
 * Get single employee by ID
 */
exports.getEmployeeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const employee = await Employee.findOne({
      where: { id, company_id: req.user.company_id },
      include: [
        {
          model: Employee,
          as: 'manager',
          attributes: ['id', 'employee_id', 'full_name', 'position']
        }
      ]
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check permissions - users can only view their own profile unless admin/manager
    if (req.user.role === 'Staff' && req.user.employee_id !== employee.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this employee'
      });
    }

    logger.info(`Employee ${id} retrieved by user ${req.user.id}`);

    res.status(200).json({
      success: true,
      data: employee
    });
  } catch (error) {
    logger.error(`Error fetching employee ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Create new employee
 */
exports.createEmployee = async (req, res, next) => {
  try {
    const {
      employee_id,
      full_name,
      ic_no,
      passport_no,
      date_of_birth,
      gender,
      marital_status,
      nationality,
      race,
      religion,
      mobile,
      email,
      emergency_contact_name,
      emergency_contact_phone,
      current_address,
      permanent_address,
      position,
      department,
      reporting_manager_id,
      basic_salary,
      join_date,
      confirmation_date,
      employment_type,
      work_location,
      bank_name,
      bank_account_no,
      bank_account_holder,
      epf_no,
      socso_no,
      tax_no,
      tax_category,
      photo_url
    } = req.body;

    // Check if employee_id already exists within the same company
    const existingEmployee = await Employee.findOne({
      where: {
        company_id: req.user.company_id,
        [Op.or]: [
          { employee_id },
          ic_no ? { ic_no } : null
        ].filter(Boolean)
      }
    });

    if (existingEmployee) {
      return res.status(400).json({
        success: false,
        message: 'Employee with this Employee ID or IC Number already exists'
      });
    }

    // Convert empty strings to null for optional fields
    const employeeData = {
      employee_id,
      full_name,
      ic_no,
      passport_no,
      date_of_birth,
      gender,
      marital_status,
      nationality,
      race,
      religion,
      mobile,
      email,
      emergency_contact_name,
      emergency_contact_phone,
      current_address,
      permanent_address,
      position,
      department,
      reporting_manager_id,
      basic_salary,
      join_date,
      confirmation_date,
      employment_type,
      work_location,
      bank_name,
      bank_account_no,
      bank_account_holder,
      epf_no,
      socso_no,
      tax_no,
      tax_category,
      photo_url,
      company_id: req.user.company_id,
      employment_status: 'Active'
    };

    Object.keys(employeeData).forEach(key => {
      if (employeeData[key] === '' || employeeData[key] === 'Invalid date') {
        employeeData[key] = null;
      }
    });

    // Create employee scoped to active company
    const employee = await Employee.create(employeeData);

    // Note: YTD Statutory records will be created when payroll is processed
    // No need to initialize them on employee creation

    logger.info(`Employee created: ${employee.employee_id}`, {
      employee_id: employee.id,
      created_by: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: employee
    });
  } catch (error) {
    logger.error('Error creating employee:', error);
    next(error);
  }
};

/**
 * Update employee
 */
exports.updateEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const employee = await Employee.findOne({
      where: { id, company_id: req.user.company_id }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Prevent updating certain fields if not allowed
    delete updates.id;
    delete updates.user_id;
    delete updates.company_id;
    delete updates.created_at;

    // Convert empty strings to null for optional fields
    Object.keys(updates).forEach(key => {
      if (updates[key] === '') {
        updates[key] = null;
      }
    });

    // Check for duplicate employee_id or ic_no within the same company
    if (updates.employee_id || updates.ic_no) {
      const existingEmployee = await Employee.findOne({
        where: {
          id: { [Op.ne]: id },
          company_id: req.user.company_id,
          [Op.or]: [
            updates.employee_id ? { employee_id: updates.employee_id } : null,
            updates.ic_no ? { ic_no: updates.ic_no } : null
          ].filter(Boolean)
        }
      });

      if (existingEmployee) {
        return res.status(400).json({
          success: false,
          message: 'Employee with this Employee ID or IC Number already exists'
        });
      }
    }

    await employee.update(updates);

    logger.info(`Employee ${id} updated by user ${req.user.id}`, {
      employee_id: id,
      updates: Object.keys(updates)
    });

    res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      data: employee
    });
  } catch (error) {
    logger.error(`Error updating employee ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Soft delete employee (update status to Resigned/Terminated)
 */
exports.deleteEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status = 'Resigned', reason } = req.body;

    const employee = await Employee.findOne({
      where: { id, company_id: req.user.company_id }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    if (employee.employment_status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Employee is already inactive'
      });
    }

    await employee.update({
      employment_status: status
    });

    logger.info(`Employee ${id} status changed to ${status}`, {
      employee_id: id,
      reason,
      changed_by: req.user.id
    });

    res.status(200).json({
      success: true,
      message: `Employee ${status.toLowerCase()} successfully`,
      data: employee
    });
  } catch (error) {
    logger.error(`Error deleting employee ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Get YTD Statutory summary for employee
 */
exports.getEmployeeYTD = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { year = new Date().getFullYear() } = req.query;

    const employee = await Employee.findOne({
      where: { id, company_id: req.user.company_id }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check permissions
    if (req.user.role === 'Staff' && req.user.employee_id !== employee.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this data'
      });
    }

    const ytdData = await YTDStatutory.findOne({
      where: {
        employee_id: id,
        year: parseInt(year)
      }
    });

    if (!ytdData) {
      return res.status(404).json({
        success: false,
        message: `No YTD data found for year ${year}`
      });
    }

    logger.info(`YTD data retrieved for employee ${id}, year ${year}`);

    res.status(200).json({
      success: true,
      data: {
        employee: {
          id: employee.id,
          employee_id: employee.employee_id,
          full_name: employee.full_name
        },
        ytd: ytdData
      }
    });
  } catch (error) {
    logger.error(`Error fetching YTD for employee ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * Get employee statistics (for dashboard)
 */
exports.getEmployeeStatistics = async (req, res, next) => {
  try {
    const companyId = req.user.company_id;

    const totalActive = await Employee.count({
      where: { company_id: companyId, employment_status: 'Active' }
    });

    const totalResigned = await Employee.count({
      where: { company_id: companyId, employment_status: 'Resigned' }
    });

    const totalTerminated = await Employee.count({
      where: { company_id: companyId, employment_status: 'Terminated' }
    });

    const byDepartment = await Employee.findAll({
      attributes: [
        'department',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: { company_id: companyId, employment_status: 'Active' },
      group: ['department']
    });

    const byEmploymentType = await Employee.findAll({
      attributes: [
        'employment_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: { company_id: companyId, employment_status: 'Active' },
      group: ['employment_type']
    });

    res.status(200).json({
      success: true,
      data: {
        total: totalActive + totalResigned + totalTerminated,
        active: totalActive,
        resigned: totalResigned,
        terminated: totalTerminated,
        by_department: byDepartment,
        by_employment_type: byEmploymentType
      }
    });
  } catch (error) {
    logger.error('Error fetching employee statistics:', error);
    next(error);
  }
};

/**
 * Get own profile (for authenticated employee)
 */
exports.getOwnProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const employee = await Employee.findOne({
      where: { user_id: userId, company_id: req.user.company_id },
      attributes: { exclude: ['user_id'] }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'No employee profile linked to this account'
      });
    }

    logger.info(`Own profile retrieved for employee ${employee.id}`);

    res.status(200).json({
      success: true,
      data: employee
    });
  } catch (error) {
    logger.error('Error fetching own profile:', error);
    next(error);
  }
};

/**
 * Update own profile (for authenticated employee)
 * Only allows updating non-sensitive fields
 */
exports.updateOwnProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const employee = await Employee.findOne({
      where: { user_id: userId, company_id: req.user.company_id }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee profile not found'
      });
    }

    // Only allow updating specific fields
    const allowedFields = [
      'mobile',
      'email',
      'current_address',
      'permanent_address',
      'emergency_contact_name',
      'emergency_contact_phone',
      'photo_url'
    ];

    // Filter request body to only include allowed fields
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    // Check if any restricted fields were sent
    const restrictedFields = [
      'basic_salary', 'position', 'department', 'employment_type',
      'employment_status', 'join_date', 'confirmation_date',
      'reporting_manager_id', 'bank_name', 'bank_account_no',
      'epf_no', 'socso_no', 'tax_no', 'ic_no', 'passport_no'
    ];

    const attemptedRestrictedFields = restrictedFields.filter(field => req.body[field] !== undefined);
    if (attemptedRestrictedFields.length > 0) {
      logger.warn(`Employee ${employee.id} attempted to update restricted fields: ${attemptedRestrictedFields.join(', ')}`);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update. Allowed fields: ' + allowedFields.join(', ')
      });
    }

    await employee.update(updateData);

    logger.info(`Own profile updated for employee ${employee.id}`, {
      updatedFields: Object.keys(updateData)
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: employee
    });
  } catch (error) {
    logger.error('Error updating own profile:', error);
    next(error);
  }
};
