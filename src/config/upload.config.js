const multer = require('multer');
const path = require('path');
const fs = require('fs');

// File size limit (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
const ALLOWED_FILE_TYPES = {
  // Documents
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'text/plain': '.txt',

  // Images
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',

  // Spreadsheets
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/csv': '.csv',

  // Compressed
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar'
};

// File filter
const fileFilter = (req, file, cb) => {
  const isAllowed = ALLOWED_FILE_TYPES[file.mimetype];

  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not supported. Allowed types: PDF, DOC, DOCX, JPG, PNG, XLS, XLSX, CSV, ZIP`), false);
  }
};

// Sanitize filename
const sanitizeFilename = (filename) => {
  // Remove path information
  const name = path.basename(filename);

  // Replace special characters and spaces
  return name
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
};

// Generate unique filename
const generateFilename = (originalname) => {
  const timestamp = Date.now();
  const sanitized = sanitizeFilename(originalname);
  const ext = path.extname(sanitized);
  const nameWithoutExt = path.basename(sanitized, ext);

  return `${timestamp}_${nameWithoutExt}${ext}`;
};

// Get storage path based on category
const getStoragePath = (category, metadata = {}) => {
  const baseDir = path.join(__dirname, '../../uploads');

  switch (category) {
    case 'employee_document':
      if (metadata.employee_id) {
        return path.join(baseDir, 'employees', String(metadata.employee_id), metadata.sub_category || 'documents');
      }
      return path.join(baseDir, 'employees', 'temp');

    case 'claim_receipt':
      if (metadata.claim_id) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return path.join(baseDir, 'claims', String(year), month, String(metadata.claim_id));
      }
      return path.join(baseDir, 'claims', 'temp');

    case 'payslip':
      if (metadata.year && metadata.month) {
        return path.join(baseDir, 'payslips', String(metadata.year), String(metadata.month));
      }
      return path.join(baseDir, 'payslips', 'temp');

    case 'leave_document':
      if (metadata.leave_id) {
        return path.join(baseDir, 'leaves', String(metadata.leave_id));
      }
      return path.join(baseDir, 'leaves', 'temp');

    case 'company_document':
      const subDir = metadata.sub_category || 'general';
      return path.join(baseDir, 'company', subDir);

    case 'invoice':
      if (metadata.year) {
        return path.join(baseDir, 'invoices', String(metadata.year));
      }
      return path.join(baseDir, 'invoices', 'temp');

    default:
      return path.join(baseDir, 'temp');
  }
};

// Ensure directory exists
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Dynamic storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Get metadata from request body or query
      const category = req.body.category || req.query.category || 'other';
      const metadata = {
        employee_id: req.body.employee_id || req.query.employee_id,
        claim_id: req.body.claim_id || req.query.claim_id,
        leave_id: req.body.leave_id || req.query.leave_id,
        year: req.body.year || req.query.year,
        month: req.body.month || req.query.month,
        sub_category: req.body.sub_category || req.query.sub_category
      };

      const storagePath = getStoragePath(category, metadata);
      ensureDirectoryExists(storagePath);

      cb(null, storagePath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueFilename = generateFilename(file.originalname);
    cb(null, uniqueFilename);
  }
});

// Multer upload configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 10 // Maximum 10 files per upload
  }
});

module.exports = {
  upload,
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES,
  sanitizeFilename,
  generateFilename,
  getStoragePath,
  ensureDirectoryExists
};
