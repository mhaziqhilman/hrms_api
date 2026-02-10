const File = require('../models/File');
const supabaseStorage = require('./supabaseStorageService');

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
   * Get files with filters
   */
  async getFiles(filters = {}, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;
      const offset = (page - 1) * limit;

      const whereClause = { status: 'active' };

      if (filters.category) whereClause.category = filters.category;
      if (filters.uploaded_by) whereClause.uploaded_by = filters.uploaded_by;
      if (filters.related_to_employee_id) whereClause.related_to_employee_id = filters.related_to_employee_id;
      if (filters.related_to_claim_id) whereClause.related_to_claim_id = filters.related_to_claim_id;
      if (filters.related_to_leave_id) whereClause.related_to_leave_id = filters.related_to_leave_id;

      const { count, rows } = await File.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: offset,
        order: [['uploaded_at', 'DESC']]
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
  async getStorageStats() {
    try {
      const stats = await File.findAll({
        attributes: [
          [File.sequelize.fn('COUNT', File.sequelize.col('id')), 'total_files'],
          [File.sequelize.fn('SUM', File.sequelize.col('file_size')), 'total_size']
        ],
        where: { status: 'active' }
      });

      const categoryStats = await File.findAll({
        attributes: [
          'category',
          [File.sequelize.fn('COUNT', File.sequelize.col('id')), 'count'],
          [File.sequelize.fn('SUM', File.sequelize.col('file_size')), 'size']
        ],
        where: { status: 'active' },
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
}

module.exports = new FileService();
