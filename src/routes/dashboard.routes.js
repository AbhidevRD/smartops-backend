import express from 'express';
import auth from '../middleware/auth.middleware.js';
import { getDashboard, stats, activity } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/', auth, getDashboard);
router.get('/stats', auth, stats);
router.get('/activity', auth, activity);

export default router;