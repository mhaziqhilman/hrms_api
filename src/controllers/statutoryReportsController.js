const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const YTDStatutory = require('../models/YTDStatutory');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { roundToTwo } = require('../utils/helpers');
const {
  generateEAFormPDF,
  generateEPFBorangAPDF,
  generateSOCSOForm8APDF,
  generatePCBCP39PDF,
  generateCSV
} = require('../services/reportGeneratorService');

// Company info placeholder (should come from settings in future)
const COMPANY_INFO = {
  name: 'Company Name',
  registration_no: 'Company Reg No',
  e_file_no: 'E File No',
  epf_no: 'EPF Employer No',
  socso_code: 'SOCSO Employer Code'
};

/**
 * Get EA Form data for a specific employee and year
 */
exports.getEAForm = async (req, res, next) => {
  try {
    const { employee_id, year } = req.params;

    // Get employee details
    const employee = await Employee.findByPk(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Get all YTD records for the year (to get final month data)
    const ytdRecords = await YTDStatutory.findAll({
      where: {
        employee_id,
        year: parseInt(year)
      },
      order: [['month', 'DESC']],
      limit: 1
    });

    // Get all payroll records for the year
    const payrollRecords = await Payroll.findAll({
      where: {
        employee_id,
        year: parseInt(year),
        status: { [Op.in]: ['Approved', 'Paid'] }
      },
      order: [['month', 'ASC']]
    });

    if (payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found for this employee and year'
      });
    }

    // Calculate totals from payroll records
    const totals = payrollRecords.reduce((acc, record) => {
      acc.salary += parseFloat(record.basic_salary) || 0;
      acc.allowances += parseFloat(record.allowances) || 0;
      acc.bonus += parseFloat(record.bonus) || 0;
      acc.commission += parseFloat(record.commission) || 0;
      acc.overtime += parseFloat(record.overtime_pay) || 0;
      acc.gross_total += parseFloat(record.gross_salary) || 0;
      acc.epf_employee += parseFloat(record.epf_employee) || 0;
      acc.epf_employer += parseFloat(record.epf_employer) || 0;
      acc.socso_employee += parseFloat(record.socso_employee) || 0;
      acc.socso_employer += parseFloat(record.socso_employer) || 0;
      acc.eis_employee += parseFloat(record.eis_employee) || 0;
      acc.eis_employer += parseFloat(record.eis_employer) || 0;
      acc.pcb += parseFloat(record.pcb_deduction) || 0;
      return acc;
    }, {
      salary: 0,
      allowances: 0,
      bonus: 0,
      commission: 0,
      overtime: 0,
      gross_total: 0,
      epf_employee: 0,
      epf_employer: 0,
      socso_employee: 0,
      socso_employer: 0,
      eis_employee: 0,
      eis_employer: 0,
      pcb: 0
    });

    const totalDeductions = totals.epf_employee + totals.socso_employee + totals.eis_employee + totals.pcb;

    // Build EA form data
    const eaFormData = {
      year: parseInt(year),
      employer: COMPANY_INFO,
      employee: {
        id: employee.id,
        employee_id: employee.employee_id,
        full_name: employee.full_name,
        ic_no: employee.ic_no,
        tax_no: employee.tax_no,
        position: employee.position,
        department: employee.department
      },
      income: {
        salary: roundToTwo(totals.salary),
        allowances: roundToTwo(totals.allowances),
        bonus: roundToTwo(totals.bonus),
        commission: roundToTwo(totals.commission),
        overtime: roundToTwo(totals.overtime),
        gross_total: roundToTwo(totals.gross_total)
      },
      deductions: {
        epf_employee: roundToTwo(totals.epf_employee),
        socso_employee: roundToTwo(totals.socso_employee),
        eis_employee: roundToTwo(totals.eis_employee),
        pcb: roundToTwo(totals.pcb),
        total: roundToTwo(totalDeductions)
      },
      employer_contributions: {
        epf: roundToTwo(totals.epf_employer),
        socso: roundToTwo(totals.socso_employer),
        eis: roundToTwo(totals.eis_employer)
      },
      months_worked: payrollRecords.length,
      net_income: roundToTwo(totals.gross_total - totalDeductions)
    };

    logger.info(`EA Form generated for employee ${employee_id}, year ${year}`, {
      user_id: req.user.id
    });

    res.status(200).json({
      success: true,
      data: eaFormData
    });
  } catch (error) {
    logger.error('Error generating EA Form:', error);
    next(error);
  }
};

/**
 * Download EA Form as PDF
 */
exports.downloadEAFormPDF = async (req, res, next) => {
  try {
    const { employee_id, year } = req.params;

    // Get EA form data first
    const employee = await Employee.findByPk(employee_id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const payrollRecords = await Payroll.findAll({
      where: {
        employee_id,
        year: parseInt(year),
        status: { [Op.in]: ['Approved', 'Paid'] }
      }
    });

    if (payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found'
      });
    }

    // Calculate totals
    const totals = payrollRecords.reduce((acc, record) => {
      acc.salary += parseFloat(record.basic_salary) || 0;
      acc.allowances += parseFloat(record.allowances) || 0;
      acc.bonus += parseFloat(record.bonus) || 0;
      acc.commission += parseFloat(record.commission) || 0;
      acc.overtime += parseFloat(record.overtime_pay) || 0;
      acc.gross_total += parseFloat(record.gross_salary) || 0;
      acc.epf_employee += parseFloat(record.epf_employee) || 0;
      acc.epf_employer += parseFloat(record.epf_employer) || 0;
      acc.socso_employee += parseFloat(record.socso_employee) || 0;
      acc.socso_employer += parseFloat(record.socso_employer) || 0;
      acc.eis_employee += parseFloat(record.eis_employee) || 0;
      acc.eis_employer += parseFloat(record.eis_employer) || 0;
      acc.pcb += parseFloat(record.pcb_deduction) || 0;
      return acc;
    }, {
      salary: 0, allowances: 0, bonus: 0, commission: 0, overtime: 0, gross_total: 0,
      epf_employee: 0, epf_employer: 0, socso_employee: 0, socso_employer: 0,
      eis_employee: 0, eis_employer: 0, pcb: 0
    });

    const totalDeductions = totals.epf_employee + totals.socso_employee + totals.eis_employee + totals.pcb;

    const eaFormData = {
      year: parseInt(year),
      employer: COMPANY_INFO,
      employee: {
        full_name: employee.full_name,
        ic_no: employee.ic_no,
        tax_no: employee.tax_no,
        position: employee.position
      },
      income: {
        salary: roundToTwo(totals.salary),
        allowances: roundToTwo(totals.allowances),
        bonus: roundToTwo(totals.bonus),
        commission: roundToTwo(totals.commission),
        overtime: roundToTwo(totals.overtime),
        gross_total: roundToTwo(totals.gross_total)
      },
      deductions: {
        epf_employee: roundToTwo(totals.epf_employee),
        socso_employee: roundToTwo(totals.socso_employee),
        eis_employee: roundToTwo(totals.eis_employee),
        pcb: roundToTwo(totals.pcb),
        total: roundToTwo(totalDeductions)
      },
      employer_contributions: {
        epf: roundToTwo(totals.epf_employer),
        socso: roundToTwo(totals.socso_employer),
        eis: roundToTwo(totals.eis_employer)
      }
    };

    const pdfBuffer = await generateEAFormPDF(eaFormData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=EA_Form_${employee.employee_id}_${year}.pdf`);
    res.send(pdfBuffer);

    logger.info(`EA Form PDF downloaded for employee ${employee_id}, year ${year}`);
  } catch (error) {
    logger.error('Error generating EA Form PDF:', error);
    next(error);
  }
};

/**
 * Get EPF Borang A data (monthly)
 */
exports.getEPFBorangA = async (req, res, next) => {
  try {
    const { year, month } = req.params;

    const payrollRecords = await Payroll.findAll({
      where: {
        year: parseInt(year),
        month: parseInt(month),
        status: { [Op.in]: ['Approved', 'Paid'] }
      },
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'employee_id', 'full_name', 'ic_no', 'epf_no']
      }],
      order: [['employee', 'full_name', 'ASC']]
    });

    if (payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found for this period'
      });
    }

    const employees = payrollRecords.map(record => ({
      employee_id: record.employee.employee_id,
      full_name: record.employee.full_name,
      ic_no: record.employee.ic_no,
      epf_no: record.employee.epf_no,
      wages: roundToTwo(parseFloat(record.gross_salary) || 0),
      employee_epf: roundToTwo(parseFloat(record.epf_employee) || 0),
      employer_epf: roundToTwo(parseFloat(record.epf_employer) || 0),
      total_epf: roundToTwo((parseFloat(record.epf_employee) || 0) + (parseFloat(record.epf_employer) || 0))
    }));

    const totals = employees.reduce((acc, emp) => {
      acc.wages += emp.wages;
      acc.employee_epf += emp.employee_epf;
      acc.employer_epf += emp.employer_epf;
      acc.total_epf += emp.total_epf;
      return acc;
    }, { wages: 0, employee_epf: 0, employer_epf: 0, total_epf: 0 });

    const reportData = {
      year: parseInt(year),
      month: parseInt(month),
      employer: COMPANY_INFO,
      employees,
      totals: {
        wages: roundToTwo(totals.wages),
        employee_epf: roundToTwo(totals.employee_epf),
        employer_epf: roundToTwo(totals.employer_epf),
        total_epf: roundToTwo(totals.total_epf)
      },
      employee_count: employees.length
    };

    logger.info(`EPF Borang A generated for ${month}/${year}`, { user_id: req.user.id });

    res.status(200).json({
      success: true,
      data: reportData
    });
  } catch (error) {
    logger.error('Error generating EPF Borang A:', error);
    next(error);
  }
};

/**
 * Download EPF Borang A as PDF
 */
exports.downloadEPFBorangAPDF = async (req, res, next) => {
  try {
    const { year, month } = req.params;

    const payrollRecords = await Payroll.findAll({
      where: {
        year: parseInt(year),
        month: parseInt(month),
        status: { [Op.in]: ['Approved', 'Paid'] }
      },
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'employee_id', 'full_name', 'ic_no', 'epf_no']
      }]
    });

    if (payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found'
      });
    }

    const employees = payrollRecords.map(record => ({
      full_name: record.employee.full_name,
      ic_no: record.employee.ic_no,
      epf_no: record.employee.epf_no,
      wages: roundToTwo(parseFloat(record.gross_salary) || 0),
      employee_epf: roundToTwo(parseFloat(record.epf_employee) || 0),
      employer_epf: roundToTwo(parseFloat(record.epf_employer) || 0),
      total_epf: roundToTwo((parseFloat(record.epf_employee) || 0) + (parseFloat(record.epf_employer) || 0))
    }));

    const totals = employees.reduce((acc, emp) => {
      acc.wages += emp.wages;
      acc.employee_epf += emp.employee_epf;
      acc.employer_epf += emp.employer_epf;
      acc.total_epf += emp.total_epf;
      return acc;
    }, { wages: 0, employee_epf: 0, employer_epf: 0, total_epf: 0 });

    const reportData = {
      year: parseInt(year),
      month: parseInt(month),
      employer: COMPANY_INFO,
      employees,
      totals
    };

    const pdfBuffer = await generateEPFBorangAPDF(reportData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=EPF_Borang_A_${year}_${String(month).padStart(2, '0')}.pdf`);
    res.send(pdfBuffer);

    logger.info(`EPF Borang A PDF downloaded for ${month}/${year}`);
  } catch (error) {
    logger.error('Error generating EPF Borang A PDF:', error);
    next(error);
  }
};

/**
 * Get SOCSO Form 8A data (monthly)
 */
exports.getSOCSOForm8A = async (req, res, next) => {
  try {
    const { year, month } = req.params;

    const payrollRecords = await Payroll.findAll({
      where: {
        year: parseInt(year),
        month: parseInt(month),
        status: { [Op.in]: ['Approved', 'Paid'] }
      },
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'employee_id', 'full_name', 'ic_no', 'socso_no']
      }],
      order: [['employee', 'full_name', 'ASC']]
    });

    if (payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found for this period'
      });
    }

    const employees = payrollRecords.map(record => ({
      employee_id: record.employee.employee_id,
      full_name: record.employee.full_name,
      ic_no: record.employee.ic_no,
      socso_no: record.employee.socso_no,
      wages: roundToTwo(parseFloat(record.gross_salary) || 0),
      employee_socso: roundToTwo(parseFloat(record.socso_employee) || 0),
      employer_socso: roundToTwo(parseFloat(record.socso_employer) || 0),
      total_socso: roundToTwo((parseFloat(record.socso_employee) || 0) + (parseFloat(record.socso_employer) || 0))
    }));

    const totals = employees.reduce((acc, emp) => {
      acc.wages += emp.wages;
      acc.employee_socso += emp.employee_socso;
      acc.employer_socso += emp.employer_socso;
      acc.total_socso += emp.total_socso;
      return acc;
    }, { wages: 0, employee_socso: 0, employer_socso: 0, total_socso: 0 });

    const reportData = {
      year: parseInt(year),
      month: parseInt(month),
      employer: COMPANY_INFO,
      employees,
      totals: {
        wages: roundToTwo(totals.wages),
        employee_socso: roundToTwo(totals.employee_socso),
        employer_socso: roundToTwo(totals.employer_socso),
        total_socso: roundToTwo(totals.total_socso)
      },
      employee_count: employees.length
    };

    logger.info(`SOCSO Form 8A generated for ${month}/${year}`, { user_id: req.user.id });

    res.status(200).json({
      success: true,
      data: reportData
    });
  } catch (error) {
    logger.error('Error generating SOCSO Form 8A:', error);
    next(error);
  }
};

/**
 * Download SOCSO Form 8A as PDF
 */
exports.downloadSOCSOForm8APDF = async (req, res, next) => {
  try {
    const { year, month } = req.params;

    const payrollRecords = await Payroll.findAll({
      where: {
        year: parseInt(year),
        month: parseInt(month),
        status: { [Op.in]: ['Approved', 'Paid'] }
      },
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'employee_id', 'full_name', 'ic_no', 'socso_no']
      }]
    });

    if (payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found'
      });
    }

    const employees = payrollRecords.map(record => ({
      full_name: record.employee.full_name,
      ic_no: record.employee.ic_no,
      socso_no: record.employee.socso_no,
      wages: roundToTwo(parseFloat(record.gross_salary) || 0),
      employee_socso: roundToTwo(parseFloat(record.socso_employee) || 0),
      employer_socso: roundToTwo(parseFloat(record.socso_employer) || 0),
      total_socso: roundToTwo((parseFloat(record.socso_employee) || 0) + (parseFloat(record.socso_employer) || 0))
    }));

    const totals = employees.reduce((acc, emp) => {
      acc.wages += emp.wages;
      acc.employee_socso += emp.employee_socso;
      acc.employer_socso += emp.employer_socso;
      acc.total_socso += emp.total_socso;
      return acc;
    }, { wages: 0, employee_socso: 0, employer_socso: 0, total_socso: 0 });

    const reportData = {
      year: parseInt(year),
      month: parseInt(month),
      employer: COMPANY_INFO,
      employees,
      totals
    };

    const pdfBuffer = await generateSOCSOForm8APDF(reportData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=SOCSO_Form_8A_${year}_${String(month).padStart(2, '0')}.pdf`);
    res.send(pdfBuffer);

    logger.info(`SOCSO Form 8A PDF downloaded for ${month}/${year}`);
  } catch (error) {
    logger.error('Error generating SOCSO Form 8A PDF:', error);
    next(error);
  }
};

/**
 * Get PCB CP39 data (monthly)
 */
exports.getPCBCP39 = async (req, res, next) => {
  try {
    const { year, month } = req.params;

    const payrollRecords = await Payroll.findAll({
      where: {
        year: parseInt(year),
        month: parseInt(month),
        status: { [Op.in]: ['Approved', 'Paid'] }
      },
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'employee_id', 'full_name', 'ic_no', 'tax_no']
      }],
      order: [['employee', 'full_name', 'ASC']]
    });

    if (payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found for this period'
      });
    }

    const employees = payrollRecords.map(record => ({
      employee_id: record.employee.employee_id,
      full_name: record.employee.full_name,
      ic_no: record.employee.ic_no,
      tax_no: record.employee.tax_no,
      gross_salary: roundToTwo(parseFloat(record.gross_salary) || 0),
      epf_employee: roundToTwo(parseFloat(record.epf_employee) || 0),
      pcb: roundToTwo(parseFloat(record.pcb_deduction) || 0)
    }));

    const totals = employees.reduce((acc, emp) => {
      acc.gross_salary += emp.gross_salary;
      acc.epf_employee += emp.epf_employee;
      acc.pcb += emp.pcb;
      return acc;
    }, { gross_salary: 0, epf_employee: 0, pcb: 0 });

    const reportData = {
      year: parseInt(year),
      month: parseInt(month),
      employer: COMPANY_INFO,
      employees,
      totals: {
        gross_salary: roundToTwo(totals.gross_salary),
        epf_employee: roundToTwo(totals.epf_employee),
        pcb: roundToTwo(totals.pcb)
      },
      employee_count: employees.length
    };

    logger.info(`PCB CP39 generated for ${month}/${year}`, { user_id: req.user.id });

    res.status(200).json({
      success: true,
      data: reportData
    });
  } catch (error) {
    logger.error('Error generating PCB CP39:', error);
    next(error);
  }
};

/**
 * Download PCB CP39 as PDF
 */
exports.downloadPCBCP39PDF = async (req, res, next) => {
  try {
    const { year, month } = req.params;

    const payrollRecords = await Payroll.findAll({
      where: {
        year: parseInt(year),
        month: parseInt(month),
        status: { [Op.in]: ['Approved', 'Paid'] }
      },
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'employee_id', 'full_name', 'ic_no', 'tax_no']
      }]
    });

    if (payrollRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found'
      });
    }

    const employees = payrollRecords.map(record => ({
      full_name: record.employee.full_name,
      ic_no: record.employee.ic_no,
      tax_no: record.employee.tax_no,
      gross_salary: roundToTwo(parseFloat(record.gross_salary) || 0),
      epf_employee: roundToTwo(parseFloat(record.epf_employee) || 0),
      pcb: roundToTwo(parseFloat(record.pcb_deduction) || 0)
    }));

    const totals = employees.reduce((acc, emp) => {
      acc.gross_salary += emp.gross_salary;
      acc.epf_employee += emp.epf_employee;
      acc.pcb += emp.pcb;
      return acc;
    }, { gross_salary: 0, epf_employee: 0, pcb: 0 });

    const reportData = {
      year: parseInt(year),
      month: parseInt(month),
      employer: COMPANY_INFO,
      employees,
      totals
    };

    const pdfBuffer = await generatePCBCP39PDF(reportData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=PCB_CP39_${year}_${String(month).padStart(2, '0')}.pdf`);
    res.send(pdfBuffer);

    logger.info(`PCB CP39 PDF downloaded for ${month}/${year}`);
  } catch (error) {
    logger.error('Error generating PCB CP39 PDF:', error);
    next(error);
  }
};

/**
 * Download report as CSV (e-filing format)
 */
exports.downloadCSV = async (req, res, next) => {
  try {
    const { type, year, month, employee_id } = req.params;

    let reportData;
    let filename;

    switch (type) {
      case 'epf':
        const epfRecords = await Payroll.findAll({
          where: {
            year: parseInt(year),
            month: parseInt(month),
            status: { [Op.in]: ['Approved', 'Paid'] }
          },
          include: [{
            model: Employee,
            as: 'employee',
            attributes: ['full_name', 'ic_no', 'epf_no']
          }]
        });

        reportData = {
          employees: epfRecords.map(r => ({
            full_name: r.employee.full_name,
            ic_no: r.employee.ic_no,
            epf_no: r.employee.epf_no,
            wages: parseFloat(r.gross_salary),
            employee_epf: parseFloat(r.epf_employee),
            employer_epf: parseFloat(r.epf_employer),
            total_epf: parseFloat(r.epf_employee) + parseFloat(r.epf_employer)
          })),
          totals: epfRecords.reduce((acc, r) => {
            acc.wages += parseFloat(r.gross_salary);
            acc.employee_epf += parseFloat(r.epf_employee);
            acc.employer_epf += parseFloat(r.epf_employer);
            acc.total_epf += parseFloat(r.epf_employee) + parseFloat(r.epf_employer);
            return acc;
          }, { wages: 0, employee_epf: 0, employer_epf: 0, total_epf: 0 })
        };
        filename = `EPF_${year}_${String(month).padStart(2, '0')}.csv`;
        break;

      case 'socso':
        const socsoRecords = await Payroll.findAll({
          where: {
            year: parseInt(year),
            month: parseInt(month),
            status: { [Op.in]: ['Approved', 'Paid'] }
          },
          include: [{
            model: Employee,
            as: 'employee',
            attributes: ['full_name', 'ic_no', 'socso_no']
          }]
        });

        reportData = {
          employees: socsoRecords.map(r => ({
            full_name: r.employee.full_name,
            ic_no: r.employee.ic_no,
            socso_no: r.employee.socso_no,
            wages: parseFloat(r.gross_salary),
            employee_socso: parseFloat(r.socso_employee),
            employer_socso: parseFloat(r.socso_employer),
            total_socso: parseFloat(r.socso_employee) + parseFloat(r.socso_employer)
          })),
          totals: socsoRecords.reduce((acc, r) => {
            acc.wages += parseFloat(r.gross_salary);
            acc.employee_socso += parseFloat(r.socso_employee);
            acc.employer_socso += parseFloat(r.socso_employer);
            acc.total_socso += parseFloat(r.socso_employee) + parseFloat(r.socso_employer);
            return acc;
          }, { wages: 0, employee_socso: 0, employer_socso: 0, total_socso: 0 })
        };
        filename = `SOCSO_${year}_${String(month).padStart(2, '0')}.csv`;
        break;

      case 'pcb':
        const pcbRecords = await Payroll.findAll({
          where: {
            year: parseInt(year),
            month: parseInt(month),
            status: { [Op.in]: ['Approved', 'Paid'] }
          },
          include: [{
            model: Employee,
            as: 'employee',
            attributes: ['full_name', 'ic_no', 'tax_no']
          }]
        });

        reportData = {
          employees: pcbRecords.map(r => ({
            full_name: r.employee.full_name,
            ic_no: r.employee.ic_no,
            tax_no: r.employee.tax_no,
            gross_salary: parseFloat(r.gross_salary),
            epf_employee: parseFloat(r.epf_employee),
            pcb: parseFloat(r.pcb_deduction)
          })),
          totals: pcbRecords.reduce((acc, r) => {
            acc.gross_salary += parseFloat(r.gross_salary);
            acc.epf_employee += parseFloat(r.epf_employee);
            acc.pcb += parseFloat(r.pcb_deduction);
            return acc;
          }, { gross_salary: 0, epf_employee: 0, pcb: 0 })
        };
        filename = `PCB_${year}_${String(month).padStart(2, '0')}.csv`;
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid report type'
        });
    }

    const csvContent = generateCSV(type, reportData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csvContent);

    logger.info(`${type.toUpperCase()} CSV downloaded for ${month}/${year}`);
  } catch (error) {
    logger.error('Error generating CSV:', error);
    next(error);
  }
};

/**
 * Get available report periods (years and months with payroll data)
 */
exports.getAvailablePeriods = async (req, res, next) => {
  try {
    const periods = await Payroll.findAll({
      attributes: [
        [Payroll.sequelize.fn('DISTINCT', Payroll.sequelize.col('year')), 'year'],
        'month'
      ],
      where: {
        status: { [Op.in]: ['Approved', 'Paid'] }
      },
      group: ['year', 'month'],
      order: [['year', 'DESC'], ['month', 'DESC']],
      raw: true
    });

    // Group by year
    const groupedPeriods = periods.reduce((acc, { year, month }) => {
      if (!acc[year]) {
        acc[year] = [];
      }
      acc[year].push(month);
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: groupedPeriods
    });
  } catch (error) {
    logger.error('Error fetching available periods:', error);
    next(error);
  }
};

/**
 * Get employees list for EA form selection
 */
exports.getEmployeesForEA = async (req, res, next) => {
  try {
    const { year } = req.params;

    // Get employees who have payroll in the specified year
    const payrollRecords = await Payroll.findAll({
      where: {
        year: parseInt(year),
        status: { [Op.in]: ['Approved', 'Paid'] }
      },
      include: [{
        model: Employee,
        as: 'employee',
        attributes: ['id', 'employee_id', 'full_name', 'ic_no', 'department', 'position']
      }],
      attributes: ['employee_id'],
      group: ['employee_id'],
      raw: false
    });

    // Get unique employees
    const employeesMap = new Map();
    payrollRecords.forEach(record => {
      if (!employeesMap.has(record.employee_id)) {
        employeesMap.set(record.employee_id, record.employee);
      }
    });

    const employees = Array.from(employeesMap.values()).map(emp => ({
      id: emp.id,
      employee_id: emp.employee_id,
      full_name: emp.full_name,
      ic_no: emp.ic_no,
      department: emp.department,
      position: emp.position
    }));

    res.status(200).json({
      success: true,
      data: employees
    });
  } catch (error) {
    logger.error('Error fetching employees for EA:', error);
    next(error);
  }
};

module.exports = exports;
