import express from 'express';
import {
  googleCallback,
  getOAuthConfig
} from '../controllers/oauth.controller.js';

const router = express.Router();

// OAuth configuration endpoint
router.get('/config', getOAuthConfig);

// Google OAuth callback
router.post('/google/callback', googleCallback);

export default router;
