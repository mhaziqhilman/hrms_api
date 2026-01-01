const Policy = require('../models/Policy');
const PolicyAcknowledgment = require('../models/PolicyAcknowledgment');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { Op } = require('sequelize');

// Create a new policy
exports.createPolicy = async (req, res) => {
  try {
    const {
      policy_code,
      title,
      description,
      content,
      category,
      version,
      status,
      effective_from,
      review_date,
      expires_at,
      requires_acknowledgment,
      file_url,
      file_size,
      tags,
      parent_policy_id
    } = req.body;

    // Check if policy_code already exists
    const existingPolicy = await Policy.findOne({ where: { policy_code } });
    if (existingPolicy) {
      return res.status(400).json({
        success: false,
        message: 'Policy code already exists'
      });
    }

    const policy = await Policy.create({
      policy_code,
      title,
      description,
      content,
      category: category || 'Other',
      version: version || '1.0',
      status: status || 'Draft',
      author_id: req.user.id,
      effective_from,
      review_date,
      expires_at,
      requires_acknowledgment: requires_acknowledgment !== false,
      file_url,
      file_size,
      tags,
      parent_policy_id
    });

    const createdPolicy = await Policy.findByPk(policy.id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'email', 'full_name']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Policy created successfully',
      data: createdPolicy
    });
  } catch (error) {
    console.error('Error creating policy:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating policy',
      error: error.message
    });
  }
};

// Get all policies with filtering and pagination
exports.getAllPolicies = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      category,
      search,
      author_id,
      include_expired
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const whereClause = {};

    // Filter by status
    if (status) {
      whereClause.status = status;
    } else {
      // Default: show only active policies for staff
      if (req.user.role === 'staff') {
        whereClause.status = 'Active';
      }
    }

    // Filter by category
    if (category) {
      whereClause.category = category;
    }

    // Filter by author
    if (author_id) {
      whereClause.author_id = author_id;
    }

    // Search in title, description, and policy_code
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { policy_code: { [Op.like]: `%${search}%` } }
      ];
    }

    // Filter expired policies
    if (!include_expired || include_expired === 'false') {
      whereClause[Op.or] = [
        { expires_at: null },
        { expires_at: { [Op.gte]: new Date() } }
      ];
    }

    // Count total matching records
    const totalCount = await Policy.count({ where: whereClause });

    // Fetch policies with pagination
    const policies = await Policy.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'email', 'full_name']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'email', 'full_name']
        },
        {
          model: Policy,
          as: 'parent',
          attributes: ['id', 'policy_code', 'title', 'version']
        }
      ],
      order: [
        ['category', 'ASC'],
        ['policy_code', 'ASC'],
        ['created_at', 'DESC']
      ],
      limit: parseInt(limit),
      offset: offset
    });

    res.json({
      success: true,
      data: policies,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching policies:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching policies',
      error: error.message
    });
  }
};

// Get single policy by ID
exports.getPolicyById = async (req, res) => {
  try {
    const { id } = req.params;

    const policy = await Policy.findByPk(id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'email', 'full_name']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'email', 'full_name']
        },
        {
          model: Policy,
          as: 'parent',
          attributes: ['id', 'policy_code', 'title', 'version']
        },
        {
          model: Policy,
          as: 'versions',
          attributes: ['id', 'policy_code', 'title', 'version', 'status', 'created_at']
        },
        {
          model: PolicyAcknowledgment,
          as: 'acknowledgments',
          include: [
            {
              model: Employee,
              as: 'employee',
              attributes: ['id', 'employee_id', 'full_name']
            }
          ]
        }
      ]
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }

    // Check permissions for staff
    if (req.user.role === 'staff' && policy.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this policy'
      });
    }

    // Increment view count
    await policy.increment('view_count');

    // Create or update acknowledgment record for staff
    if (req.user.role === 'staff') {
      const employee = await Employee.findOne({
        where: { user_id: req.user.id }
      });

      if (employee) {
        await PolicyAcknowledgment.findOrCreate({
          where: {
            policy_id: id,
            employee_id: employee.id,
            policy_version: policy.version
          },
          defaults: {
            viewed_at: new Date(),
            ip_address: req.ip
          }
        });
      }
    }

    res.json({
      success: true,
      data: policy
    });
  } catch (error) {
    console.error('Error fetching policy:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching policy',
      error: error.message
    });
  }
};

// Update policy
exports.updatePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      policy_code,
      title,
      description,
      content,
      category,
      version,
      status,
      effective_from,
      review_date,
      expires_at,
      requires_acknowledgment,
      file_url,
      file_size,
      tags
    } = req.body;

    const policy = await Policy.findByPk(id);

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }

    // Check permissions: only author or admin can update
    if (req.user.role !== 'admin' && policy.author_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this policy'
      });
    }

    // Check if policy_code is being changed and if it already exists
    if (policy_code && policy_code !== policy.policy_code) {
      const existingPolicy = await Policy.findOne({ where: { policy_code } });
      if (existingPolicy) {
        return res.status(400).json({
          success: false,
          message: 'Policy code already exists'
        });
      }
    }

    await policy.update({
      policy_code,
      title,
      description,
      content,
      category,
      version,
      status,
      effective_from,
      review_date,
      expires_at,
      requires_acknowledgment,
      file_url,
      file_size,
      tags
    });

    const updatedPolicy = await Policy.findByPk(id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'email', 'full_name']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'email', 'full_name']
        }
      ]
    });

    res.json({
      success: true,
      message: 'Policy updated successfully',
      data: updatedPolicy
    });
  } catch (error) {
    console.error('Error updating policy:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating policy',
      error: error.message
    });
  }
};

// Delete policy
exports.deletePolicy = async (req, res) => {
  try {
    const { id } = req.params;

    const policy = await Policy.findByPk(id);

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }

    // Only admin can delete
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this policy'
      });
    }

    await policy.destroy();

    res.json({
      success: true,
      message: 'Policy deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting policy:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting policy',
      error: error.message
    });
  }
};

// Approve policy
exports.approvePolicy = async (req, res) => {
  try {
    const { id } = req.params;

    const policy = await Policy.findByPk(id);

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }

    // Only admin can approve
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to approve this policy'
      });
    }

    await policy.update({
      status: 'Active',
      approved_by: req.user.id,
      approved_at: new Date()
    });

    const approvedPolicy = await Policy.findByPk(id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'email', 'full_name']
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'email', 'full_name']
        }
      ]
    });

    res.json({
      success: true,
      message: 'Policy approved successfully',
      data: approvedPolicy
    });
  } catch (error) {
    console.error('Error approving policy:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving policy',
      error: error.message
    });
  }
};

// Acknowledge policy
exports.acknowledgePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    const policy = await Policy.findByPk(id);

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }

    if (!policy.requires_acknowledgment) {
      return res.status(400).json({
        success: false,
        message: 'This policy does not require acknowledgment'
      });
    }

    // Get employee
    const employee = await Employee.findOne({
      where: { user_id: req.user.id }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    // Find acknowledgment record
    const acknowledgment = await PolicyAcknowledgment.findOne({
      where: {
        policy_id: id,
        employee_id: employee.id,
        policy_version: policy.version
      }
    });

    if (!acknowledgment) {
      // Create new acknowledgment
      const newAcknowledgment = await PolicyAcknowledgment.create({
        policy_id: id,
        employee_id: employee.id,
        policy_version: policy.version,
        viewed_at: new Date(),
        acknowledged_at: new Date(),
        ip_address: req.ip,
        comments
      });

      // Increment acknowledgment count
      await policy.increment('acknowledgment_count');

      return res.json({
        success: true,
        message: 'Policy acknowledged successfully',
        data: newAcknowledgment
      });
    }

    if (acknowledgment.acknowledged_at) {
      return res.status(400).json({
        success: false,
        message: 'You have already acknowledged this policy'
      });
    }

    // Update acknowledgment
    await acknowledgment.update({
      acknowledged_at: new Date(),
      ip_address: req.ip,
      comments
    });

    // Increment acknowledgment count
    await policy.increment('acknowledgment_count');

    res.json({
      success: true,
      message: 'Policy acknowledged successfully',
      data: acknowledgment
    });
  } catch (error) {
    console.error('Error acknowledging policy:', error);
    res.status(500).json({
      success: false,
      message: 'Error acknowledging policy',
      error: error.message
    });
  }
};

// Get policy statistics
exports.getPolicyStatistics = async (req, res) => {
  try {
    const { id } = req.params;

    const policy = await Policy.findByPk(id, {
      include: [
        {
          model: PolicyAcknowledgment,
          as: 'acknowledgments',
          include: [
            {
              model: Employee,
              as: 'employee',
              attributes: ['id', 'employee_id', 'full_name', 'department', 'position']
            }
          ]
        }
      ]
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'Policy not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && policy.author_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view statistics'
      });
    }

    // Calculate statistics
    const totalViews = policy.acknowledgments.length;
    const totalAcknowledgments = policy.acknowledgments.filter(a => a.acknowledged_at).length;
    const totalEmployees = await Employee.count({ where: { employment_status: 'Active' } });

    const viewPercentage = totalEmployees > 0 ? ((totalViews / totalEmployees) * 100).toFixed(2) : 0;
    const acknowledgmentPercentage = totalEmployees > 0 ? ((totalAcknowledgments / totalEmployees) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        policy_id: policy.id,
        policy_code: policy.policy_code,
        title: policy.title,
        version: policy.version,
        total_employees: totalEmployees,
        total_views: totalViews,
        total_acknowledgments: totalAcknowledgments,
        view_percentage: viewPercentage,
        acknowledgment_percentage: acknowledgmentPercentage,
        requires_acknowledgment: policy.requires_acknowledgment,
        acknowledgments: policy.acknowledgments
      }
    });
  } catch (error) {
    console.error('Error fetching policy statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching policy statistics',
      error: error.message
    });
  }
};

// Get policy categories
exports.getPolicyCategories = async (req, res) => {
  try {
    const categories = [
      'HR',
      'IT',
      'Finance',
      'Safety',
      'Compliance',
      'Operations',
      'Other'
    ];

    // Count policies in each category
    const categoryCounts = await Promise.all(
      categories.map(async (category) => {
        const count = await Policy.count({
          where: {
            category,
            status: 'Active'
          }
        });
        return { category, count };
      })
    );

    res.json({
      success: true,
      data: categoryCounts
    });
  } catch (error) {
    console.error('Error fetching policy categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching policy categories',
      error: error.message
    });
  }
};
