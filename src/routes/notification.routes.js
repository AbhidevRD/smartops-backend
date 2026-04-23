import express from 'express';
import auth from '../middleware/auth.middleware.js';

import {
 getMyNotifications,
 markRead
} from '../controllers/notification.controller.js';

const router = express.Router();

router.get('/', auth, getMyNotifications);
router.patch('/:id/read', auth, markRead);

export default router;