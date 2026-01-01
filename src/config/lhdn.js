require('dotenv').config();

module.exports = {
  // LHDN MyInvois API Configuration
  apiUrl: process.env.LHDN_API_URL || 'https://api.myinvois.hasil.gov.my',
  clientId: process.env.LHDN_CLIENT_ID || '',
  clientSecret: process.env.LHDN_CLIENT_SECRET || '',

  // Environment: 'sandbox' or 'production'
  environment: process.env.LHDN_ENVIRONMENT || 'sandbox',

  // API Endpoints
  endpoints: {
    login: '/connect/token',
    submitDocument: '/api/v1.0/documentsubmissions',
    getDocument: '/api/v1.0/documents',
    cancelDocument: '/api/v1.0/documents/state',
    validateTIN: '/api/v1.0/taxpayer/validate'
  },

  // Document Types
  documentTypes: {
    invoice: '01', // Invoice
    creditNote: '02', // Credit Note
    debitNote: '03', // Debit Note
    refundNote: '04' // Refund Note
  },

  // Timeout settings (in milliseconds)
  timeout: parseInt(process.env.LHDN_TIMEOUT) || 30000,

  // Retry configuration
  retry: {
    attempts: 3,
    delay: 1000 // milliseconds
  }
};
