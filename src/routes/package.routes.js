const express = require('express');
const router = express.Router();
const { listPackages } = require('../controllers/subscriptionController');

// Public — pricing page / upgrade comparison. Includes is_available flag so
// the frontend can render Pro/Enterprise as "Coming Soon".
router.get('/', listPackages);

module.exports = router;
