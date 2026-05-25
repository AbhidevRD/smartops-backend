import express from 'express';

import {
  signup,
  login,
  forgotPassword,
  googleLogin,
  verifyOTP,
  resetPasswordWithOTP
} from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password', resetPasswordWithOTP);
router.post('/google-login', googleLogin);

export default router;