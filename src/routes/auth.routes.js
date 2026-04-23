import express from 'express';

import {
  signup,
  verifyOtp,
  login
} from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/verify-otp', verifyOtp);
router.post('/login', login);

export default router;