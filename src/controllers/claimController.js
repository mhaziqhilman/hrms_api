const Claim = require('../models/Claim');
const ClaimType = require('../models/ClaimType');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { Op } = require('sequelize');

// Submit a new claim
exports.submitClaim = async (req, res) => {
  try {
    const { employee_id, claim_type_id, date, amount, description, receipt_url } = req.body;

    // Verify employee exists and belongs to active company
    const employee = await Employee.findOne({
      where: { id: employee_id, company_id: req.user.company_id }
    });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check permission - staff can only submit for themselves
    if (req.user.role === 'staff') {
      if (employee.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only submit claims for yourself'
        });
      }
    }

    // Verify claim type exists
    const claimType = await ClaimType.findByPk(claim_type_id);
    if (!claimType) {
      return res.status(404).json({
        success: false,
        message: 'Claim type not found'
      });
    }

    // Create claim
    const claim = await Claim.create({
      employee_id,
      claim_type_id,
      date,
      amount,
      description,
      receipt_url,
      status: 'Pending'
    });

    // Fetch created claim with associations
    const createdClaim = await Claim.findByPk(claim.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'full_name', 'employee_id']
        },
        {
          model: ClaimType,
          as: 'claimType',
          attributes: ['id', 'name', 'description']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Claim submitted successfully',
      data: createdClaim
    });
  } catch (error) {
    console.error('Error submitting claim:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting claim',
      error: error.message
    });
  }
};

// Get all claims with filtering and pagination
exports.getAllClaims = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      employee_id,
      claim_type_id,
      status,
      start_date,
      end_date
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const whereClause = {};

    // Role-based filtering
    if (req.user.role === 'staff') {
      // Staff can only see their own claims
      const employee = await Employee.findOne({ where: { user_id: req.user.id } });
      if (!employee) {
        return res.status(200).json({
          success: true,
          data: { claims: [], pagination: { total: 0, currentPage: 1, limit: parseInt(limit), totalPages: 0 } }
        });
      }
      whereClause.employee_id = employee.id;
    } else if (employee_id) {
      whereClause.employee_id = employee_id;
    }

    if (claim_type_id) whereClause.claim_type_id = claim_type_id;
    if (status) whereClause.status = status;

    if (start_date || end_date) {
      whereClause.date = {};
      if (start_date) whereClause.date[Op.gte] = start_date;
      if (end_date) whereClause.date[Op.lte] = end_date;
    }

    const { count, rows } = await Claim.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'full_name', 'employee_id', 'department', 'position'],
          where: { company_id: req.user.company_id },
          required: true
        },
        {
          model: ClaimType,
          as: 'claimType',
          attributes: ['id', 'name', 'description']
        },
        {
          model: User,
          as: 'managerApprover',
          attributes: ['id', 'email', 'role']
        },
        {
          model: User,
          as: 'financeApprover',
          attributes: ['id', 'email', 'role']
        }
      ],
      limit: parseInt(limit),
      offset: offset,
      order: [['date', 'DESC'], ['created_at', 'DESC']],
      distinct: true
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching claims:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching claims',
      error: error.message
    });
  }
};

// Get single claim by ID
exports.getClaimById = async (req, res) => {
  try {
    const { id } = req.params;

    const claim = await Claim.findByPk(id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'full_name', 'employee_id', 'department', 'position'],
          where: { company_id: req.user.company_id },
          required: true
        },
        {
          model: ClaimType,
          as: 'claimType',
          attributes: ['id', 'name', 'description']
        },
        {
          model: User,
          as: 'managerApprover',
          attributes: ['id', 'email', 'role']
        },
        {
          model: User,
          as: 'financeApprover',
          attributes: ['id', 'email', 'role']
        }
      ]
    });

    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    // Check permission - staff can only view their own claims
    if (req.user.role === 'staff') {
      const employee = await Employee.findOne({ where: { user_id: req.user.id } });
      if (!employee || claim.employee_id !== employee.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only view your own claims'
        });
      }
    }

    res.json({
      success: true,
      data: claim
    });
  } catch (error) {
    console.error('Error fetching claim:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching claim',
      error: error.message
    });
  }
};

// Update claim (only for pending claims)
exports.updateClaim = async (req, res) => {
  try {
    const { id } = req.params;
    const { claim_type_id, date, amount, description, receipt_url } = req.body;

    const claim = await Claim.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    // Only pending claims can be updated
    if (claim.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending claims can be updated'
      });
    }

    // Check permission - staff can only update their own claims
    if (req.user.role === 'staff') {
      const employee = await Employee.findOne({ where: { user_id: req.user.id } });
      if (!employee || claim.employee_id !== employee.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only update your own claims'
        });
      }
    }

    // Update fields
    if (claim_type_id !== undefined) claim.claim_type_id = claim_type_id;
    if (date !== undefined) claim.date = date;
    if (amount !== undefined) claim.amount = amount;
    if (description !== undefined) claim.description = description;
    if (receipt_url !== undefined) claim.receipt_url = receipt_url;

    await claim.save();

    // Fetch updated claim with associations
    const updatedClaim = await Claim.findByPk(claim.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'full_name', 'employee_id']
        },
        {
          model: ClaimType,
          as: 'claimType',
          attributes: ['id', 'name', 'description']
        }
      ]
    });

    res.json({
      success: true,
      message: 'Claim updated successfully',
      data: updatedClaim
    });
  } catch (error) {
    console.error('Error updating claim:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating claim',
      error: error.message
    });
  }
};

// Manager approval/rejection
exports.managerApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejection_reason } = req.body; // action: 'approve' or 'reject'

    const claim = await Claim.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    // Only pending claims can be approved/rejected by manager
    if (claim.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending claims can be approved or rejected by manager'
      });
    }

    if (action === 'approve') {
      claim.status = 'Manager_Approved';
      claim.manager_approved_by = req.user.id;
      claim.manager_approved_at = new Date();
      claim.rejection_reason = null;
    } else if (action === 'reject') {
      if (!rejection_reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }
      claim.status = 'Rejected';
      claim.rejection_reason = rejection_reason;
      claim.manager_approved_by = req.user.id;
      claim.manager_approved_at = new Date();
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "approve" or "reject"'
      });
    }

    await claim.save();

    // Fetch updated claim with associations
    const updatedClaim = await Claim.findByPk(claim.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'full_name', 'employee_id']
        },
        {
          model: ClaimType,
          as: 'claimType',
          attributes: ['id', 'name', 'description']
        },
        {
          model: User,
          as: 'managerApprover',
          attributes: ['id', 'email', 'role']
        }
      ]
    });

    res.json({
      success: true,
      message: `Claim ${action === 'approve' ? 'approved' : 'rejected'} by manager successfully`,
      data: updatedClaim
    });
  } catch (error) {
    console.error('Error processing manager approval:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing manager approval',
      error: error.message
    });
  }
};

// Finance approval/rejection or mark as paid
exports.financeApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejection_reason, payment_reference } = req.body;
    // action: 'approve', 'reject', or 'paid'

    const claim = await Claim.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    if (action === 'approve') {
      // Finance can only approve manager-approved claims
      if (claim.status !== 'Manager_Approved') {
        return res.status(400).json({
          success: false,
          message: 'Only manager-approved claims can be approved by finance'
        });
      }
      claim.status = 'Finance_Approved';
      claim.finance_approved_by = req.user.id;
      claim.finance_approved_at = new Date();
      claim.rejection_reason = null;

    } else if (action === 'reject') {
      // Finance can reject manager-approved or finance-approved claims
      if (!['Manager_Approved', 'Finance_Approved'].includes(claim.status)) {
        return res.status(400).json({
          success: false,
          message: 'Only manager-approved or finance-approved claims can be rejected by finance'
        });
      }
      if (!rejection_reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }
      claim.status = 'Rejected';
      claim.rejection_reason = rejection_reason;
      claim.finance_approved_by = req.user.id;
      claim.finance_approved_at = new Date();

    } else if (action === 'paid') {
      // Only finance-approved claims can be marked as paid
      if (claim.status !== 'Finance_Approved') {
        return res.status(400).json({
          success: false,
          message: 'Only finance-approved claims can be marked as paid'
        });
      }
      claim.status = 'Paid';
      claim.paid_at = new Date();
      claim.payment_reference = payment_reference;

    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "approve", "reject", or "paid"'
      });
    }

    await claim.save();

    // Fetch updated claim with associations
    const updatedClaim = await Claim.findByPk(claim.id, {
      include: [
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'full_name', 'employee_id']
        },
        {
          model: ClaimType,
          as: 'claimType',
          attributes: ['id', 'name', 'description']
        },
        {
          model: User,
          as: 'managerApprover',
          attributes: ['id', 'email', 'role']
        },
        {
          model: User,
          as: 'financeApprover',
          attributes: ['id', 'email', 'role']
        }
      ]
    });

    res.json({
      success: true,
      message: `Claim ${action === 'approve' ? 'approved by finance' : action === 'reject' ? 'rejected by finance' : 'marked as paid'} successfully`,
      data: updatedClaim
    });
  } catch (error) {
    console.error('Error processing finance approval:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing finance approval',
      error: error.message
    });
  }
};

// Delete claim (Admin only, or staff for their own pending claims)
exports.deleteClaim = async (req, res) => {
  try {
    const { id } = req.params;

    const claim = await Claim.findOne({
      where: { id },
      include: [{ model: Employee, as: 'employee', where: { company_id: req.user.company_id }, attributes: [] }]
    });
    if (!claim) {
      return res.status(404).json({
        success: false,
        message: 'Claim not found'
      });
    }

    // Check permission
    if (req.user.role === 'staff') {
      const employee = await Employee.findOne({ where: { user_id: req.user.id } });
      if (!employee || claim.employee_id !== employee.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only delete your own claims'
        });
      }
      // Staff can only delete pending claims
      if (claim.status !== 'Pending') {
        return res.status(403).json({
          success: false,
          message: 'You can only delete pending claims'
        });
      }
    }

    await claim.destroy();

    res.json({
      success: true,
      message: 'Claim deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting claim:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting claim',
      error: error.message
    });
  }
};

// Get claims summary for an employee
exports.getClaimsSummary = async (req, res) => {
  try {
    const { employee_id } = req.params;
    const { year = new Date().getFullYear(), month } = req.query;

    // Check permission - staff can only view their own summary
    if (req.user.role === 'staff') {
      const employee = await Employee.findOne({ where: { user_id: req.user.id } });
      if (!employee || employee.id !== parseInt(employee_id)) {
        return res.status(403).json({
          success: false,
          message: 'You can only view your own claims summary'
        });
      }
    }

    // Verify employee exists and belongs to active company
    const employee = await Employee.findOne({
      where: { id: employee_id, company_id: req.user.company_id }
    });
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Build date filter
    const dateFilter = {};
    if (month) {
      // Specific month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      dateFilter.date = {
        [Op.between]: [startDate, endDate]
      };
    } else {
      // Whole year
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);
      dateFilter.date = {
        [Op.between]: [startDate, endDate]
      };
    }

    // Get all claims for the period
    const claims = await Claim.findAll({
      where: {
        employee_id,
        ...dateFilter
      },
      include: [
        {
          model: ClaimType,
          as: 'claimType',
          attributes: ['id', 'name']
        }
      ]
    });

    // Calculate summary
    const summary = {
      employee_id: parseInt(employee_id),
      employee_name: employee.full_name,
      period: month ? `${year}-${String(month).padStart(2, '0')}` : year.toString(),
      total_claims: claims.length,
      total_amount: 0,
      pending_count: 0,
      pending_amount: 0,
      manager_approved_count: 0,
      manager_approved_amount: 0,
      finance_approved_count: 0,
      finance_approved_amount: 0,
      paid_count: 0,
      paid_amount: 0,
      rejected_count: 0,
      rejected_amount: 0,
      by_type: {}
    };

    claims.forEach(claim => {
      const amount = parseFloat(claim.amount);
      summary.total_amount += amount;

      // Count by status
      if (claim.status === 'Pending') {
        summary.pending_count++;
        summary.pending_amount += amount;
      } else if (claim.status === 'Manager_Approved') {
        summary.manager_approved_count++;
        summary.manager_approved_amount += amount;
      } else if (claim.status === 'Finance_Approved') {
        summary.finance_approved_count++;
        summary.finance_approved_amount += amount;
      } else if (claim.status === 'Paid') {
        summary.paid_count++;
        summary.paid_amount += amount;
      } else if (claim.status === 'Rejected') {
        summary.rejected_count++;
        summary.rejected_amount += amount;
      }

      // Count by type
      const typeName = claim.claimType.name;
      if (!summary.by_type[typeName]) {
        summary.by_type[typeName] = {
          count: 0,
          total_amount: 0
        };
      }
      summary.by_type[typeName].count++;
      summary.by_type[typeName].total_amount += amount;
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching claims summary:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching claims summary',
      error: error.message
    });
  }
};

// Get all claim types
exports.getAllClaimTypes = async (req, res) => {
  try {
    const claimTypes = await ClaimType.findAll({
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: claimTypes,
      pagination: {
        total: claimTypes.length,
        page: 1,
        limit: claimTypes.length,
        totalPages: 1
      }
    });
  } catch (error) {
    console.error('Error fetching claim types:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching claim types',
      error: error.message
    });
  }
};
