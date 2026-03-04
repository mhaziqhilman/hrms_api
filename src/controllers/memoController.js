const Memo = require('../models/Memo');
const MemoReadReceipt = require('../models/MemoReadReceipt');
const AnnouncementCategory = require('../models/AnnouncementCategory');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { Op, literal, fn, cast } = require('sequelize');
const { sequelize } = require('../config/database');

// Build target audience filter conditions for staff users
// Uses JSONB cast because target_* columns are JSON type and @> requires JSONB
function buildTargetConditions(employee) {
  // Escape single quotes for safe SQL literal usage
  const escapeForSql = (val) => JSON.stringify(val).replace(/'/g, "''");
  return [
    { target_audience: 'All' },
    {
      target_audience: 'Department',
      [Op.and]: literal(
        `"target_departments"::jsonb @> '${escapeForSql([employee.department])}'::jsonb`
      )
    },
    {
      target_audience: 'Position',
      [Op.and]: literal(
        `"target_positions"::jsonb @> '${escapeForSql([employee.position])}'::jsonb`
      )
    },
    {
      target_audience: 'Specific',
      [Op.and]: literal(
        `"target_employee_ids"::jsonb @> '${escapeForSql([employee.id])}'::jsonb`
      )
    }
  ];
}
const notificationService = require('../services/notificationService');
const storageService = require('../services/supabaseStorageService');

// Resolve photo_url to signed URL for each memo's author employee
async function resolveAuthorPhotos(memos) {
  if (!storageService.isConfigured()) return;
  const list = Array.isArray(memos) ? memos : [memos];
  for (const memo of list) {
    const photoUrl = memo.author?.employee?.photo_url;
    if (photoUrl && !photoUrl.startsWith('http')) {
      try {
        memo.author.employee.photo_url = await storageService.getSignedUrl(photoUrl, 3600);
      } catch {
        memo.author.employee.photo_url = null;
      }
    }
  }
}

// Common includes for author info + category
const getStandardIncludes = (company_id) => [
  {
    model: User,
    as: 'author',
    attributes: ['id', 'email', 'role'],
    include: [{
      model: Employee,
      as: 'employee',
      attributes: ['full_name', 'position', 'department', 'photo_url'],
      where: { company_id },
      required: false
    }]
  },
  {
    model: AnnouncementCategory,
    as: 'category',
    attributes: ['id', 'name', 'slug', 'color', 'icon']
  }
];

// Create a new memo
exports.createMemo = async (req, res) => {
  try {
    const {
      title,
      content,
      summary,
      status,
      priority,
      category_id,
      is_pinned,
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
      company_id: req.user.company_id,
      category_id: category_id || null,
      is_pinned: is_pinned || false,
      pinned_at: is_pinned ? new Date() : null,
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
      include: getStandardIncludes(req.user.company_id)
    });

    // Notify employees if memo is published
    if (memo.status === 'Published') {
      const empWhere = { company_id: req.user.company_id };
      if (memo.target_audience === 'Department' && memo.target_departments?.length) {
        empWhere.department = { [Op.in]: memo.target_departments };
      } else if (memo.target_audience === 'Position' && memo.target_positions?.length) {
        empWhere.position = { [Op.in]: memo.target_positions };
      } else if (memo.target_audience === 'Specific' && memo.target_employee_ids?.length) {
        empWhere.id = { [Op.in]: memo.target_employee_ids };
      }
      const targetEmployees = await Employee.findAll({ where: empWhere, attributes: ['user_id'] });
      const userIds = targetEmployees.map(e => e.user_id).filter(Boolean);
      if (userIds.length) {
        notificationService.createBulkNotifications(
          userIds,
          req.user.company_id,
          'announcement_published',
          'New Announcement',
          memo.title,
          { memo_id: memo.id, link: '/communication' }
        );
      }
    }

    const createdJson = createdMemo.toJSON();
    await resolveAuthorPhotos([createdJson]);

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: createdJson
    });
  } catch (error) {
    console.error('Error creating memo:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating announcement',
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
      category_id,
      target_audience,
      search,
      author_id,
      date_from,
      date_to,
      sort_by = 'newest',
      include_expired
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const company_id = req.user.company_id;

    // Build where clause
    const whereClause = { company_id };

    // Filter by status
    if (status) {
      whereClause.status = status;
    } else {
      whereClause.status = { [Op.ne]: 'Archived' };
    }

    // Filter by priority
    if (priority) {
      whereClause.priority = priority;
    }

    // Filter by category
    if (category_id) {
      whereClause.category_id = parseInt(category_id);
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
        { title: { [Op.iLike]: `%${search}%` } },
        { summary: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Date range filter on published_at
    if (date_from || date_to) {
      whereClause.published_at = {};
      if (date_from) whereClause.published_at[Op.gte] = new Date(date_from);
      if (date_to) whereClause.published_at[Op.lte] = new Date(date_to);
    }

    // Filter expired memos
    if (!include_expired || include_expired === 'false') {
      // Combine with existing Op.or if search is present
      const expiryCondition = {
        [Op.or]: [
          { expires_at: null },
          { expires_at: { [Op.gte]: new Date() } }
        ]
      };
      if (whereClause[Op.or]) {
        // Wrap search and expiry together under Op.and
        const searchCondition = whereClause[Op.or];
        delete whereClause[Op.or];
        whereClause[Op.and] = [
          { [Op.or]: searchCondition },
          expiryCondition
        ];
      } else {
        Object.assign(whereClause, expiryCondition);
      }
    }

    // Role-based filtering: Staff can only see published memos targeted to them
    if (req.user.role === 'staff') {
      whereClause.status = 'Published';

      const employee = await Employee.findOne({
        where: { user_id: req.user.id, company_id }
      });

      if (employee) {
        const targetConditions = buildTargetConditions(employee);

        if (whereClause[Op.and]) {
          whereClause[Op.and].push({ [Op.or]: targetConditions });
        } else {
          whereClause[Op.and] = [{ [Op.or]: targetConditions }];
        }
      }
    }

    // Build sort order
    let order;
    switch (sort_by) {
      case 'oldest':
        order = [['is_pinned', 'DESC'], ['pinned_at', 'DESC NULLS LAST'], ['published_at', 'ASC'], ['created_at', 'ASC']];
        break;
      case 'priority':
        order = [['is_pinned', 'DESC'], ['pinned_at', 'DESC NULLS LAST'], ['priority', 'DESC'], ['published_at', 'DESC']];
        break;
      case 'newest':
      default:
        order = [['is_pinned', 'DESC'], ['pinned_at', 'DESC NULLS LAST'], ['published_at', 'DESC NULLS LAST'], ['created_at', 'DESC']];
        break;
    }

    const totalCount = await Memo.count({ where: whereClause });

    const memos = await Memo.findAll({
      where: whereClause,
      include: getStandardIncludes(company_id),
      order,
      limit: parseInt(limit),
      offset
    });

    const memosJson = memos.map(m => m.toJSON());
    await resolveAuthorPhotos(memosJson);

    res.json({
      success: true,
      data: memosJson,
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
      message: 'Error fetching announcements',
      error: error.message
    });
  }
};

// Get pinned memos for the company
exports.getPinnedMemos = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const whereClause = {
      company_id,
      is_pinned: true,
      status: 'Published'
    };

    // Staff: only see targeted memos
    if (req.user.role === 'staff') {
      const employee = await Employee.findOne({
        where: { user_id: req.user.id, company_id }
      });

      if (employee) {
        whereClause[Op.or] = buildTargetConditions(employee);
      }
    }

    const memos = await Memo.findAll({
      where: whereClause,
      include: getStandardIncludes(company_id),
      order: [['pinned_at', 'DESC']],
      limit: 10
    });

    const memosJson = memos.map(m => m.toJSON());
    await resolveAuthorPhotos(memosJson);

    res.json({
      success: true,
      data: memosJson
    });
  } catch (error) {
    console.error('Error fetching pinned memos:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pinned announcements',
      error: error.message
    });
  }
};

// Toggle pin/unpin a memo
exports.togglePin = async (req, res) => {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;

    const memo = await Memo.findOne({ where: { public_id: id, company_id } });

    if (!memo) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    const newPinned = !memo.is_pinned;
    await memo.update({
      is_pinned: newPinned,
      pinned_at: newPinned ? new Date() : null
    });

    const updatedMemo = await Memo.findByPk(memo.id, {
      include: getStandardIncludes(company_id)
    });

    const updatedJson = updatedMemo.toJSON();
    await resolveAuthorPhotos([updatedJson]);

    res.json({
      success: true,
      message: newPinned ? 'Announcement pinned' : 'Announcement unpinned',
      data: updatedJson
    });
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ success: false, message: 'Error toggling pin', error: error.message });
  }
};

// Get single memo by ID
exports.getMemoById = async (req, res) => {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;

    const memo = await Memo.findOne({
      where: { public_id: id, company_id },
      include: [
        ...getStandardIncludes(company_id),
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
        message: 'Announcement not found'
      });
    }

    // Check permissions for staff
    if (req.user.role === 'staff') {
      if (memo.status !== 'Published') {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this announcement'
        });
      }

      const employee = await Employee.findOne({
        where: { user_id: req.user.id, company_id }
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
            message: 'This announcement is not targeted to you'
          });
        }
      }
    }

    // Increment view count
    await memo.increment('view_count');

    // Create or update read receipt
    if (req.user.employee_id) {
      const [receipt, created] = await MemoReadReceipt.findOrCreate({
        where: {
          memo_id: memo.id,
          employee_id: req.user.employee_id
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

    const memoJson = memo.toJSON();
    await resolveAuthorPhotos([memoJson]);

    res.json({
      success: true,
      data: memoJson
    });
  } catch (error) {
    console.error('Error fetching memo:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching announcement',
      error: error.message
    });
  }
};

// Update memo
exports.updateMemo = async (req, res) => {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;
    const {
      title,
      content,
      summary,
      status,
      priority,
      category_id,
      is_pinned,
      target_audience,
      target_departments,
      target_positions,
      target_employee_ids,
      expires_at,
      requires_acknowledgment
    } = req.body;

    const memo = await Memo.findOne({ where: { public_id: id, company_id } });

    if (!memo) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    // Check permissions: only author or admin can update
    if (!['super_admin', 'admin'].includes(req.user.role) && memo.author_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this announcement'
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

    if (category_id !== undefined) updateData.category_id = category_id || null;

    if (is_pinned !== undefined) {
      updateData.is_pinned = is_pinned;
      updateData.pinned_at = is_pinned ? (memo.pinned_at || new Date()) : null;
    }

    // Handle status change to Published
    if (status && status !== memo.status) {
      updateData.status = status;
      if (status === 'Published' && !memo.published_at) {
        updateData.published_at = new Date();
      }
    }

    await memo.update(updateData);

    // Notify employees if memo was just published
    if (updateData.status === 'Published' && memo.status === 'Published') {
      const empWhere = { company_id: company_id };
      const audience = memo.target_audience;
      if (audience === 'Department' && memo.target_departments?.length) {
        empWhere.department = { [Op.in]: memo.target_departments };
      } else if (audience === 'Position' && memo.target_positions?.length) {
        empWhere.position = { [Op.in]: memo.target_positions };
      } else if (audience === 'Specific' && memo.target_employee_ids?.length) {
        empWhere.id = { [Op.in]: memo.target_employee_ids };
      }
      const targetEmployees = await Employee.findAll({ where: empWhere, attributes: ['user_id'] });
      const userIds = targetEmployees.map(e => e.user_id).filter(Boolean);
      if (userIds.length) {
        notificationService.createBulkNotifications(
          userIds,
          company_id,
          'announcement_published',
          'New Announcement',
          memo.title,
          { memo_id: memo.id, link: '/communication' }
        );
      }
    }

    const updatedMemo = await Memo.findByPk(memo.id, {
      include: getStandardIncludes(company_id)
    });

    const updatedJson = updatedMemo.toJSON();
    await resolveAuthorPhotos([updatedJson]);

    res.json({
      success: true,
      message: 'Announcement updated successfully',
      data: updatedJson
    });
  } catch (error) {
    console.error('Error updating memo:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating announcement',
      error: error.message
    });
  }
};

// Delete memo
exports.deleteMemo = async (req, res) => {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;

    const memo = await Memo.findOne({ where: { public_id: id, company_id } });

    if (!memo) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    // Only admin or author can delete
    if (!['super_admin', 'admin'].includes(req.user.role) && memo.author_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this announcement'
      });
    }

    await memo.destroy();

    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting memo:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting announcement',
      error: error.message
    });
  }
};

// Acknowledge memo
exports.acknowledgeMemo = async (req, res) => {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;

    const memo = await Memo.findOne({ where: { public_id: id, company_id } });

    if (!memo) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    if (!memo.requires_acknowledgment) {
      return res.status(400).json({
        success: false,
        message: 'This announcement does not require acknowledgment'
      });
    }

    const employee = await Employee.findOne({
      where: { user_id: req.user.id, company_id }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee record not found'
      });
    }

    const [receipt, created] = await MemoReadReceipt.findOrCreate({
      where: {
        memo_id: memo.id,
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

      await memo.increment('acknowledgment_count');
    }

    res.json({
      success: true,
      message: 'Announcement acknowledged successfully',
      data: receipt
    });
  } catch (error) {
    console.error('Error acknowledging memo:', error);
    res.status(500).json({
      success: false,
      message: 'Error acknowledging announcement',
      error: error.message
    });
  }
};

// Get memo statistics
exports.getMemoStatistics = async (req, res) => {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;

    const memo = await Memo.findOne({
      where: { public_id: id, company_id },
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
        message: 'Announcement not found'
      });
    }

    // Check permissions
    if (!['super_admin', 'admin', 'manager'].includes(req.user.role) && memo.author_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view statistics'
      });
    }

    const totalReads = memo.read_receipts.length;
    const totalAcknowledgments = memo.read_receipts.filter(r => r.acknowledged_at).length;

    let targetCount = 0;
    if (memo.target_audience === 'All') {
      targetCount = await Employee.count({ where: { company_id, employment_status: 'Active' } });
    } else if (memo.target_audience === 'Department') {
      targetCount = await Employee.count({
        where: {
          company_id,
          department: { [Op.in]: memo.target_departments || [] },
          employment_status: 'Active'
        }
      });
    } else if (memo.target_audience === 'Position') {
      targetCount = await Employee.count({
        where: {
          company_id,
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
      message: 'Error fetching statistics',
      error: error.message
    });
  }
};
