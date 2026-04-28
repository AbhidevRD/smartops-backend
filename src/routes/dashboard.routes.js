import express from 'express';
import auth from '../middleware/auth.middleware.js';
import { stats, activity } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/stats', auth, stats);
router.get('/activity', auth, activity);

export default router;