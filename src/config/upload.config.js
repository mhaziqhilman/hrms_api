const multer = require('multer');
const path = require('path');

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

// Get Supabase storage path based on category (returns path string, not filesystem path)
const getStoragePath = (category, metadata = {}) => {
  switch (category) {
    case 'employee_document':
      if (metadata.employee_id) {
        return `employees/${metadata.employee_id}/${metadata.sub_category || 'documents'}`;
      }
      return 'employees/temp';

    case 'claim_receipt':
      if (metadata.claim_id) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `claims/${year}/${month}/${metadata.claim_id}`;
      }
      return 'claims/temp';

    case 'payslip':
      if (metadata.year && metadata.month) {
        return `payslips/${metadata.year}/${metadata.month}`;
      }
      return 'payslips/temp';

    case 'leave_document':
      if (metadata.leave_id) {
        return `leaves/${metadata.leave_id}`;
      }
      return 'leaves/temp';

    case 'company_document': {
      const subDir = metadata.sub_category || 'general';
      return `company/${subDir}`;
    }

    case 'invoice':
      if (metadata.year) {
        return `invoices/${metadata.year}`;
      }
      return 'invoices/temp';

    default:
      return 'temp';
  }
};

// Memory storage (files buffered in memory, then uploaded to Supabase Storage)
const storage = multer.memoryStorage();

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
  getStoragePath
};
