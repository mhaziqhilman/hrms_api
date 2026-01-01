const path = require('path');
const fs = require('fs');
const fileService = require('../services/fileService');
const File = require('../models/File');

// Upload file(s)
exports.uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const {
      category,
      sub_category,
      description,
      related_to_employee_id,
      related_to_claim_id,
      related_to_leave_id,
      related_to_payroll_id,
      related_to_invoice_id,
      is_public
    } = req.body;

    const uploadedFiles = [];

    for (const file of req.files) {
      const fileData = {
        original_filename: file.originalname,
        stored_filename: file.filename,
        file_path: file.path,
        file_size: file.size,
        mime_type: file.mimetype,
        file_extension: path.extname(file.originalname).toLowerCase(),
        category: category || 'other',
        sub_category: sub_category || null,
        uploaded_by: req.user.id,
        related_to_employee_id: related_to_employee_id || null,
        related_to_claim_id: related_to_claim_id || null,
        related_to_leave_id: related_to_leave_id || null,
        related_to_payroll_id: related_to_payroll_id || null,
        related_to_invoice_id: related_to_invoice_id || null,
        description: description || null,
        is_public: is_public === 'true' || is_public === true,
        status: 'active'
      };

      const savedFile = await fileService.saveFileMetadata(fileData);
      uploadedFiles.push(savedFile);
    }

    res.status(201).json({
      success: true,
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      data: uploadedFiles
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading files',
      error: error.message
    });
  }
};

// Get all files with filters
exports.getAllFiles = async (req, res) => {
  try {
    const {
      category,
      uploaded_by,
      related_to_employee_id,
      related_to_claim_id,
      related_to_leave_id,
      page,
      limit
    } = req.query;

    const filters = {};
    if (category) filters.category = category;
    if (uploaded_by) filters.uploaded_by = uploaded_by;
    if (related_to_employee_id) filters.related_to_employee_id = related_to_employee_id;
    if (related_to_claim_id) filters.related_to_claim_id = related_to_claim_id;
    if (related_to_leave_id) filters.related_to_leave_id = related_to_leave_id;

    // Role-based filtering
    if (req.user.role === 'staff') {
      // Staff can only see their own files or public files
      filters.uploaded_by = req.user.id;
    }

    const result = await fileService.getFiles(filters, { page, limit });

    res.json({
      success: true,
      data: result.files,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching files',
      error: error.message
    });
  }
};

// Get file by ID
exports.getFileById = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await fileService.getFileById(id);

    // Check permission
    if (req.user.role === 'staff') {
      if (file.uploaded_by !== req.user.id && !file.is_public) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this file'
        });
      }
    }

    res.json({
      success: true,
      data: file
    });
  } catch (error) {
    console.error('Error fetching file:', error);
    const statusCode = error.message === 'File not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Download file
exports.downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await fileService.getFileById(id);

    // Check permission
    if (req.user.role === 'staff') {
      if (file.uploaded_by !== req.user.id && !file.is_public) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to download this file'
        });
      }
    }

    // Check if file exists
    if (!fileService.fileExists(file.file_path)) {
      return res.status(404).json({
        success: false,
        message: 'File not found in file system'
      });
    }

    // Set headers for file download
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
    res.setHeader('Content-Length', file.file_size);

    // Stream file to response
    const fileStream = fs.createReadStream(file.file_path);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading file:', error);
    const statusCode = error.message === 'File not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Preview file (inline)
exports.previewFile = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await fileService.getFileById(id);

    // Check permission
    if (req.user.role === 'staff') {
      if (file.uploaded_by !== req.user.id && !file.is_public) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to preview this file'
        });
      }
    }

    // Check if file exists
    if (!fileService.fileExists(file.file_path)) {
      return res.status(404).json({
        success: false,
        message: 'File not found in file system'
      });
    }

    // Set headers for inline preview
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${file.original_filename}"`);
    res.setHeader('Content-Length', file.file_size);

    // Stream file to response
    const fileStream = fs.createReadStream(file.file_path);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error previewing file:', error);
    const statusCode = error.message === 'File not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Update file metadata
exports.updateFileMetadata = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await fileService.getFileById(id);

    // Check permission
    if (req.user.role === 'staff' && file.uploaded_by !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this file'
      });
    }

    const updatedFile = await fileService.updateFileMetadata(id, req.body);

    res.json({
      success: true,
      message: 'File metadata updated successfully',
      data: updatedFile
    });
  } catch (error) {
    console.error('Error updating file metadata:', error);
    const statusCode = error.message === 'File not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Soft delete file
exports.deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await fileService.getFileById(id);

    // Check permission
    if (req.user.role === 'staff' && file.uploaded_by !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this file'
      });
    }

    await fileService.softDeleteFile(id, req.user.id);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    const statusCode = error.message === 'File not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Permanent delete file (admin only)
exports.permanentDeleteFile = async (req, res) => {
  try {
    const { id } = req.params;

    await fileService.permanentDeleteFile(id);

    res.json({
      success: true,
      message: 'File permanently deleted'
    });
  } catch (error) {
    console.error('Error permanently deleting file:', error);
    const statusCode = error.message === 'File not found' ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Bulk delete files
exports.bulkDeleteFiles = async (req, res) => {
  try {
    const { file_ids } = req.body;

    if (!file_ids || !Array.isArray(file_ids) || file_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'file_ids array is required'
      });
    }

    const results = [];

    for (const fileId of file_ids) {
      try {
        const file = await fileService.getFileById(fileId);

        // Check permission
        if (req.user.role === 'staff' && file.uploaded_by !== req.user.id) {
          results.push({ id: fileId, success: false, message: 'Permission denied' });
          continue;
        }

        await fileService.softDeleteFile(fileId, req.user.id);
        results.push({ id: fileId, success: true, message: 'Deleted' });
      } catch (error) {
        results.push({ id: fileId, success: false, message: error.message });
      }
    }

    res.json({
      success: true,
      message: 'Bulk delete completed',
      results: results
    });
  } catch (error) {
    console.error('Error bulk deleting files:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk deleting files',
      error: error.message
    });
  }
};

// Get files by employee ID
exports.getFilesByEmployee = async (req, res) => {
  try {
    const { employee_id } = req.params;

    const result = await fileService.getFiles(
      { related_to_employee_id: employee_id },
      { page: req.query.page, limit: req.query.limit }
    );

    res.json({
      success: true,
      data: result.files,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error fetching employee files:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee files',
      error: error.message
    });
  }
};

// Get files by claim ID
exports.getFilesByClaim = async (req, res) => {
  try {
    const { claim_id } = req.params;

    const result = await fileService.getFiles(
      { related_to_claim_id: claim_id },
      { page: req.query.page, limit: req.query.limit }
    );

    res.json({
      success: true,
      data: result.files,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error fetching claim files:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching claim files',
      error: error.message
    });
  }
};

// Get storage statistics (admin only)
exports.getStorageStats = async (req, res) => {
  try {
    const stats = await fileService.getStorageStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching storage stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching storage stats',
      error: error.message
    });
  }
};
