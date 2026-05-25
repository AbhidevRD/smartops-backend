import express from 'express';
import auth from '../middleware/auth.middleware.js';

import {
 createTask,
 getTasks,
 getTask,
 updateTask,
 deleteTask,
 updateTaskStatus
} from '../controllers/task.controller.js';

const router = express.Router();

router.post('/', auth, createTask);
router.get('/', auth, getTasks);
router.get('/:id', auth, getTask);
router.put('/:id', auth, updateTask);
router.delete('/:id', auth, deleteTask);
router.patch('/:id/status', auth, updateTaskStatus);

export default router;