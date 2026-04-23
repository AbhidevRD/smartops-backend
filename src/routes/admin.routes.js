import express from 'express';
import auth from '../middleware/auth.middleware.js';
import adminOnly from '../middleware/admin.middleware.js';

import {
 getUsers,
 changeRole
} from '../controllers/admin.controller.js';

const router = express.Router();

router.get('/users', auth, adminOnly, getUsers);
router.patch('/users/:id/role', auth, adminOnly, changeRole);

export default router;