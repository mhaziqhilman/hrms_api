const { Op } = require('sequelize');
const File = require('../models/File');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Claim = require('../models/Claim');
const Leave = require('../models/Leave');
const supabaseStorage = require('./supabaseStorageService');

// Reusable include for uploader with employee name
const uploaderInclude = {
  model: User,
  as: 'uploader',
  attributes: ['id', 'email'],
  include: [{
    model: Employee,
    as: 'employee',
    attributes: ['full_name'],
    required: false
  }]
};

class FileService {
  /**
   * Save file metadata to database
   */
  async saveFileMetadata(fileData) {
    try {
      const file = await File.create(fileData);
      return file;
    } catch (error) {
      throw new Error(`Failed to save file metadata: ${error.message}`);
    }
  }

  /**
   * Get file by ID
   */
  async getFileById(fileId) {
    try {
      const file = await File.findByPk(fileId);
      if (!file) {
        throw new Error('File not found');
      }
      return file;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get files with filters (enhanced with search, sort, uploader include)
   */
  async getFiles(filters = {}, options = {}) {
    try {
      const { page = 1, limit = 20, sort = 'uploaded_at', order = 'DESC', includeUploader = false } = options;
      const offset = (page - 1) * limit;

      const whereClause = { status: 'active' };

      if (filters.company_id) whereClause.company_id = filters.company_id;
      if (filters.category) whereClause.category = filters.category;
      if (filters.uploaded_by) whereClause.uploaded_by = filters.uploaded_by;
      if (filters.related_to_employee_id) whereClause.related_to_employee_id = filters.related_to_employee_id;
      if (filters.related_to_claim_id) whereClause.related_to_claim_id = filters.related_to_claim_id;
      if (filters.related_to_leave_id) whereClause.related_to_leave_id = filters.related_to_leave_id;

      // Search by filename
      if (filters.search) {
        whereClause.original_filename = { [Op.iLike]: `%${filters.search}%` };
      }

      // Filter by verification status
      if (filters.is_verified !== undefined && filters.is_verified !== '') {
        whereClause.is_verified = filters.is_verified === 'true' || filters.is_verified === true;
      }

      // Allowed sort columns
      const allowedSortColumns = ['uploaded_at', 'original_filename', 'file_size', 'category'];
      const sortColumn = allowedSortColumns.includes(sort) ? sort : 'uploaded_at';
      const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const queryOptions = {
        where: whereClause,
        limit: parseInt(limit),
        offset: offset,
        order: [[sortColumn, sortOrder]]
      };

      // Include uploader info when requested
      if (includeUploader) {
        queryOptions.include = [uploaderInclude];
      }

      const { count, rows } = await File.findAndCountAll(queryOptions);

      return {
        files: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to fetch files: ${error.message}`);
    }
  }

  /**
   * Update file metadata
   */
  async updateFileMetadata(fileId, updateData) {
    try {
      const file = await File.findByPk(fileId);
      if (!file) {
        throw new Error('File not found');
      }

      const allowedUpdates = ['description', 'tags', 'sub_category', 'is_verified'];
      const updates = {};

      for (const key of allowedUpdates) {
        if (updateData[key] !== undefined) {
          updates[key] = updateData[key];
        }
      }

      await file.update(updates);
      return file;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Soft delete file
   */
  async softDeleteFile(fileId, deletedBy) {
    try {
      const file = await File.findByPk(fileId);
      if (!file) {
        throw new Error('File not found');
      }

      await file.update({
        status: 'deleted',
        deleted_at: new Date(),
        deleted_by: deletedBy
      });

      return file;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Permanently delete file (from Supabase Storage and database)
   */
  async permanentDeleteFile(fileId) {
    try {
      const file = await File.findByPk(fileId);
      if (!file) {
        throw new Error('File not found');
      }

      // Delete file from Supabase Storage
      try {
        await supabaseStorage.deleteFile(file.file_path);
      } catch (storageError) {
        console.warn(`Warning: Could not delete file from storage: ${storageError.message}`);
      }

      // Delete from database
      await file.destroy();

      return { message: 'File permanently deleted' };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(companyId) {
    try {
      const whereClause = { status: 'active' };
      if (companyId) whereClause.company_id = companyId;

      const stats = await File.findAll({
        attributes: [
          [File.sequelize.fn('COUNT', File.sequelize.col('id')), 'total_files'],
          [File.sequelize.fn('SUM', File.sequelize.col('file_size')), 'total_size']
        ],
        where: whereClause
      });

      const categoryStats = await File.findAll({
        attributes: [
          'category',
          [File.sequelize.fn('COUNT', File.sequelize.col('id')), 'count'],
          [File.sequelize.fn('SUM', File.sequelize.col('file_size')), 'size']
        ],
        where: whereClause,
        group: ['category']
      });

      return {
        total_files: stats[0]?.dataValues?.total_files || 0,
        total_size: stats[0]?.dataValues?.total_size || 0,
        by_category: categoryStats.map(cat => cat.dataValues)
      };
    } catch (error) {
      throw new Error(`Failed to get storage stats: ${error.message}`);
    }
  }

  /**
   * Get document overview stats for admin dashboard
   */
  async getDocumentOverviewStats(companyId) {
    try {
      const whereActive = { status: 'active' };
      if (companyId) whereActive.company_id = companyId;

      // Total active documents
      const totalDocs = await File.count({ where: whereActive });

      // Pending verification (is_verified = false)
      const pendingVerification = await File.count({
        where: { ...whereActive, is_verified: false }
      });

      // Recently uploaded (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentlyUploaded = await File.count({
        where: {
          ...whereActive,
          uploaded_at: { [Op.gte]: sevenDaysAgo }
        }
      });

      // Total storage size
      const sizeResult = await File.findAll({
        attributes: [
          [File.sequelize.fn('SUM', File.sequelize.col('file_size')), 'total_size']
        ],
        where: whereActive
      });
      const totalSize = parseInt(sizeResult[0]?.dataValues?.total_size) || 0;

      // Category breakdown
      const categoryBreakdown = await File.findAll({
        attributes: [
          'category',
          [File.sequelize.fn('COUNT', File.sequelize.col('id')), 'count'],
          [File.sequelize.fn('SUM', File.sequelize.col('file_size')), 'size']
        ],
        where: whereActive,
        group: ['category']
      });

      // Recent activity (last 10 uploads with uploader info)
      const recentActivity = await File.findAll({
        where: whereActive,
        include: [uploaderInclude],
        order: [['uploaded_at', 'DESC']],
        limit: 10
      });

      return {
        total_documents: totalDocs,
        pending_verification: pendingVerification,
        recently_uploaded: recentlyUploaded,
        total_size: totalSize,
        category_breakdown: categoryBreakdown.map(cat => ({
          category: cat.dataValues.category,
          count: parseInt(cat.dataValues.count),
          size: parseInt(cat.dataValues.size) || 0
        })),
        recent_activity: recentActivity.map(file => ({
          id: file.id,
          original_filename: file.original_filename,
          file_extension: file.file_extension,
          category: file.category,
          uploaded_at: file.uploaded_at,
          uploader: file.uploader ? {
            id: file.uploader.id,
            name: file.uploader.employee?.full_name || file.uploader.email,
            email: file.uploader.email
          } : null
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get document overview stats: ${error.message}`);
    }
  }
  /**
   * Get all documents belonging to a user (uploaded by them, linked to their employee, claims, or leaves)
   */
  async getMyDocuments(userId, employeeId, companyId, options = {}) {
    try {
      const { page = 1, limit = 20, sort = 'uploaded_at', order = 'DESC', search } = options;
      const offset = (page - 1) * limit;

      // Build OR conditions: files uploaded by user OR linked to their employee/claims/leaves
      const orConditions = [
        { uploaded_by: userId }
      ];

      if (employeeId) {
        orConditions.push({ related_to_employee_id: employeeId });

        // Find claims & leaves belonging to this employee to include their attachments
        const [claims, leaves] = await Promise.all([
          Claim.findAll({ where: { employee_id: employeeId }, attributes: ['id'] }),
          Leave.findAll({ where: { employee_id: employeeId }, attributes: ['id'] })
        ]);

        const claimIds = claims.map(c => c.id);
        const leaveIds = leaves.map(l => l.id);

        if (claimIds.length > 0) {
          orConditions.push({ related_to_claim_id: { [Op.in]: claimIds } });
        }
        if (leaveIds.length > 0) {
          orConditions.push({ related_to_leave_id: { [Op.in]: leaveIds } });
        }
      }

      const whereClause = {
        status: 'active',
        company_id: companyId,
        [Op.or]: orConditions
      };

      if (search) {
        whereClause.original_filename = { [Op.iLike]: `%${search}%` };
      }

      const allowedSortColumns = ['uploaded_at', 'original_filename', 'file_size', 'category'];
      const sortColumn = allowedSortColumns.includes(sort) ? sort : 'uploaded_at';
      const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const { count, rows } = await File.findAndCountAll({
        where: whereClause,
        include: [uploaderInclude],
        limit: parseInt(limit),
        offset,
        order: [[sortColumn, sortOrder]]
      });

      return {
        files: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to fetch my documents: ${error.message}`);
    }
  }
}

module.exports = new FileService();
