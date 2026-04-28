import express from 'express';
import auth from '../middleware/auth.middleware.js';

import {
  sendMessage,
  getMessages,
  markRead
} from '../controllers/chat.controller.js';

const router = express.Router();

router.post(
  '/send',
  auth,
  sendMessage
);

router.get(
  '/history/:projectId',
  auth,
  getMessages
);

router.patch(
  '/read/:id',
  auth,
  markRead
);

export default router;