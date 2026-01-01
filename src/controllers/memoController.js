const Memo = require('../models/Memo');
const MemoReadReceipt = require('../models/MemoReadReceipt');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

// Create a new memo
exports.createMemo = async (req, res) => {
  try {
    const {
      title,
      content,
      summary,
      status,
      priority,
      target_audience,
      target_departments,
      target_positions,
      target_employee_ids,
      published_at,
      expires_at,
      requires_acknowledgment
    } = req.body;

    const memo = await Memo.create({
      title,
      content,
      summary,
      author_id: req.user.id,
      status: status || 'Draft',
      priority: priority || 'Normal',
      target_audience: target_audience || 'All',
      target_departments,
      target_positions,
      target_employee_ids,
      published_at: status === 'Published' ? published_at || new Date() : null,
      expires_at,
      requires_acknowledgment: requires_acknowledgment || false
    });

    const createdMemo = await Memo.findByPk(memo.id, {
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
      message: 'Memo created successfully',
      data: createdMemo
    });
  } catch (error) {
    console.error('Error creating memo:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating memo',
      error: error.message
    });
  }
};

// Get all memos with filtering and pagination
exports.getAllMemos = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      target_audience,
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
      // Default: don't show archived
      whereClause.status = { [Op.ne]: 'Archived' };
    }

    // Filter by priority
    if (priority) {
      whereClause.priority = priority;
    }

    // Filter by target audience
    if (target_audience) {
      whereClause.target_audience = target_audience;
    }

    // Filter by author
    if (author_id) {
      whereClause.author_id = author_id;
    }

    // Search in title and summary
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { summary: { [Op.like]: `%${search}%` } }
      ];
    }

    // Filter expired memos
    if (!include_expired || include_expired === 'false') {
      whereClause[Op.or] = [
        { expires_at: null },
        { expires_at: { [Op.gte]: new Date() } }
      ];
    }

    // Role-based filtering: Staff can only see published memos targeted to them
    if (req.user.role === 'staff') {
      whereClause.status = 'Published';

      // Get employee record
      const employee = await Employee.findOne({
        where: { user_id: req.user.id }
      });

      if (employee) {
        whereClause[Op.or] = [
          { target_audience: 'All' },
          {
            target_audience: 'Department',
            target_departments: { [Op.like]: `%${employee.department}%` }
          },
          {
            target_audience: 'Position',
            target_positions: { [Op.like]: `%${employee.position}%` }
          },
          {
            target_audience: 'Specific',
            target_employee_ids: { [Op.like]: `%${employee.id}%` }
          }
        ];
      }
    }

    // Count total matching records
    const totalCount = await Memo.count({ where: whereClause });

    // Fetch memos with pagination
    const memos = await Memo.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'email', 'role']
        }
      ],
      order: [
        ['priority', 'DESC'],
        ['published_at', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: parseInt(limit),
      offset: offset
    });

    res.json({
      success: true,
      data: memos,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching memos:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching memos',
      error: error.message
    });
  }
};

// Get single memo by ID
exports.getMemoById = async (req, res) => {
  try {
    const { id } = req.params;

    const memo = await Memo.findByPk(id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'email', 'full_name']
        },
        {
          model: MemoReadReceipt,
          as: 'read_receipts',
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

    if (!memo) {
      return res.status(404).json({
        success: false,
        message: 'Memo not found'
      });
    }

    // Check permissions for staff
    if (req.user.role === 'staff') {
      if (memo.status !== 'Published') {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this memo'
        });
      }

      // Check if memo is targeted to this employee
      const employee = await Employee.findOne({
        where: { user_id: req.user.id }
      });

      if (employee) {
        const isTargeted =
          memo.target_audience === 'All' ||
          (memo.target_audience === 'Department' &&
           memo.target_departments?.includes(employee.department)) ||
          (memo.target_audience === 'Position' &&
           memo.target_positions?.includes(employee.position)) ||
          (memo.target_audience === 'Specific' &&
           memo.target_employee_ids?.includes(employee.id));

        if (!isTargeted) {
          return res.status(403).json({
            success: false,
            message: 'This memo is not targeted to you'
          });
        }
      }
    }

    // Increment view count
    await memo.increment('view_count');

    // Create or update read receipt if staff
    if (req.user.role === 'staff') {
      const employee = await Employee.findOne({
        where: { user_id: req.user.id }
      });

      if (employee) {
        const [receipt, created] = await MemoReadReceipt.findOrCreate({
          where: {
            memo_id: id,
            employee_id: employee.id
          },
          defaults: {
            read_at: new Date(),
            ip_address: req.ip
          }
        });

        if (!created) {
          await receipt.update({ read_at: new Date() });
        }
      }
    }

    res.json({
      success: true,
      data: memo
    });
  } catch (error) {
    console.error('Error fetching memo:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching memo',
      error: error.message
    });
  }
};

// Update memo
exports.updateMemo = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      summary,
      status,
      priority,
      target_audience,
      target_departments,
      target_positions,
      target_employee_ids,
      expires_at,
      requires_acknowledgment
    } = req.body;

    const memo = await Memo.findByPk(id);

    if (!memo) {
      return res.status(404).json({
        success: false,
        message: 'Memo not found'
      });
    }

    // Check permissions: only author or admin can update
    if (req.user.role !== 'admin' && memo.author_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this memo'
      });
    }

    const updateData = {
      title,
      content,
      summary,
      priority,
      target_audience,
      target_departments,
      target_positions,
      target_employee_ids,
      expires_at,
      requires_acknowledgment
    };

    // Handle status change to Published
    if (status && status !== memo.status) {
      updateData.status = status;
      if (status === 'Published' && !memo.published_at) {
        updateData.published_at = new Date();
      }
    }

    await memo.update(updateData);

    const updatedMemo = await Memo.findByPk(id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'email', 'full_name']
        }
      ]
    });

    res.json({
      success: true,
      message: 'Memo updated successfully',
      data: updatedMemo
    });
  } catch (error) {
    console.error('Error updating memo:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating memo',
      error: error.message
    });
  }
};

// Delete memo
exports.deleteMemo = async (req, res) => {
  try {
    const { id } = req.params;

    const memo = await Memo.findByPk(id);

    if (!memo) {
      return res.status(404).json({
        success: false,
        message: 'Memo not found'
      });
    }

    // Only admin or author can delete
    if (req.user.role !== 'admin' && memo.author_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this memo'
      });
    }

    await memo.destroy();

    res.json({
      success: true,
      message: 'Memo deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting memo:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting memo',
      error: error.message
    });
  }
};

// Acknowledge memo
exports.acknowledgeMemo = async (req, res) => {
  try {
    const { id } = req.params;

    const memo = await Memo.findByPk(id);

    if (!memo) {
      return res.status(404).json({
        success: false,
        message: 'Memo not found'
      });
    }

    if (!memo.requires_acknowledgment) {
      return res.status(400).json({
        success: false,
        message: 'This memo does not require acknowledgment'
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

    // Find or create read receipt
    const [receipt, created] = await MemoReadReceipt.findOrCreate({
      where: {
        memo_id: id,
        employee_id: employee.id
      },
      defaults: {
        read_at: new Date(),
        acknowledged_at: new Date(),
        ip_address: req.ip
      }
    });

    if (!created && !receipt.acknowledged_at) {
      await receipt.update({
        acknowledged_at: new Date(),
        ip_address: req.ip
      });

      // Increment acknowledgment count
      await memo.increment('acknowledgment_count');
    }

    res.json({
      success: true,
      message: 'Memo acknowledged successfully',
      data: receipt
    });
  } catch (error) {
    console.error('Error acknowledging memo:', error);
    res.status(500).json({
      success: false,
      message: 'Error acknowledging memo',
      error: error.message
    });
  }
};

// Get memo statistics
exports.getMemoStatistics = async (req, res) => {
  try {
    const { id } = req.params;

    const memo = await Memo.findByPk(id, {
      include: [
        {
          model: MemoReadReceipt,
          as: 'read_receipts',
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

    if (!memo) {
      return res.status(404).json({
        success: false,
        message: 'Memo not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && memo.author_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view statistics'
      });
    }

    // Calculate statistics
    const totalReads = memo.read_receipts.length;
    const totalAcknowledgments = memo.read_receipts.filter(r => r.acknowledged_at).length;

    // Get target count
    let targetCount = 0;
    if (memo.target_audience === 'All') {
      targetCount = await Employee.count({ where: { employment_status: 'Active' } });
    } else if (memo.target_audience === 'Department') {
      targetCount = await Employee.count({
        where: {
          department: { [Op.in]: memo.target_departments || [] },
          employment_status: 'Active'
        }
      });
    } else if (memo.target_audience === 'Position') {
      targetCount = await Employee.count({
        where: {
          position: { [Op.in]: memo.target_positions || [] },
          employment_status: 'Active'
        }
      });
    } else if (memo.target_audience === 'Specific') {
      targetCount = (memo.target_employee_ids || []).length;
    }

    const readPercentage = targetCount > 0 ? ((totalReads / targetCount) * 100).toFixed(2) : 0;
    const acknowledgmentPercentage = targetCount > 0 ? ((totalAcknowledgments / targetCount) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        memo_id: memo.id,
        title: memo.title,
        target_count: targetCount,
        total_reads: totalReads,
        total_acknowledgments: totalAcknowledgments,
        read_percentage: readPercentage,
        acknowledgment_percentage: acknowledgmentPercentage,
        requires_acknowledgment: memo.requires_acknowledgment,
        read_receipts: memo.read_receipts
      }
    });
  } catch (error) {
    console.error('Error fetching memo statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching memo statistics',
      error: error.message
    });
  }
};
