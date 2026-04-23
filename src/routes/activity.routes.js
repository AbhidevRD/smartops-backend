import express from 'express';
import auth from '../middleware/auth.middleware.js';
import { getActivity } from '../controllers/activity.controller.js';

const router = express.Router();

router.get('/', auth, getActivity);

export default router;