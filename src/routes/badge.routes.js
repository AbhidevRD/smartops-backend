import express from 'express';
import auth from '../middleware/auth.middleware.js';
import adminOnly from '../middleware/admin.middleware.js';
import {
  assignBadge,
  getBadges,
  getUserBadges,
  seedBadges
} from '../controllers/badge.controller.js';

const router = express.Router();

router.get('/', auth, getBadges);
router.get('/user/:userId', auth, getUserBadges);
router.post('/assign', auth, adminOnly, assignBadge);
router.post('/seed', auth, adminOnly, seedBadges);

export default router;
