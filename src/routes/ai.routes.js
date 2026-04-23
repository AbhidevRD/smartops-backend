import express from 'express';
import auth from '../middleware/auth.middleware.js';
import { taskPrioritySuggestion } from '../controllers/ai.controller.js';

const router = express.Router();

router.post('/priority', auth, taskPrioritySuggestion);

export default router;