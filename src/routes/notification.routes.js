import express from 'express';
import auth from '../middleware/auth.middleware.js';

import {
 getMyNotifications,
 markRead,
 markAllRead
} from '../controllers/notification.controller.js';

const router = express.Router();

router.get('/', auth, getMyNotifications);
router.patch('/read-all', auth, markAllRead);
router.patch('/:id/read', auth, markRead);

export default router;