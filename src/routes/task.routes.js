import express from 'express';
import auth from '../middleware/auth.middleware.js';

import {
 createTask,
 getTasks,
 updateTaskStatus
} from '../controllers/task.controller.js';

const router = express.Router();

router.post('/', auth, createTask);
router.get('/', auth, getTasks);
router.patch('/:id/status', auth, updateTaskStatus);

export default router;