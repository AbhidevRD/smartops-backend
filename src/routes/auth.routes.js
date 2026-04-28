import express from 'express';

import {
  signup,
  verifyOtp,
  login,
  resendOtp,
  forgotPassword,
  resetPassword
} from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/verify-otp', verifyOtp);
router.post('/login', login);
router.post('/resend-otp', resendOtp);
router.post(
  '/forgot-password',
  forgotPassword
);

router.post(
  '/reset-password',
  resetPassword
);

export default router;