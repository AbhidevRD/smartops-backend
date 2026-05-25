import express from 'express';
import auth from '../middleware/auth.middleware.js';

import {
  sendSingleEmail,
  sendBulkEmail,
  getEmailLogs,
  testEmail
} from '../controllers/email.controller.js';

const router = express.Router();

// Test email endpoint (no auth required)
router.get('/test', testEmail);

router.post(
  '/send',
  auth,
  sendSingleEmail
);

router.post(
  '/bulk',
  auth,
  sendBulkEmail
);

router.get(
  '/logs',
  auth,
  getEmailLogs
);

export default router;