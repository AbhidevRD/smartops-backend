import express from 'express';
import auth from '../middleware/auth.middleware.js';
import { stats } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/stats', auth, stats);

export default router;