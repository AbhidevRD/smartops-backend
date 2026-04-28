import express from 'express';
import auth from '../middleware/auth.middleware.js';

import {
  sendSingleEmail,
  sendBulkEmail,
  getEmailLogs
} from '../controllers/email.controller.js';

const router = express.Router();

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