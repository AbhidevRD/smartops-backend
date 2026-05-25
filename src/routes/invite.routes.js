import express from 'express';
import {
  sendInvite,
  acceptInvite,
  rejectInvite,
  getInviteInfo,
  getProjectInvites,
  cancelInvite
} from '../controllers/invite.controller.js';
import auth from '../middleware/auth.middleware.js';

const router = express.Router();

// Protected routes (require JWT)
router.post('/send', auth, sendInvite);
router.post('/accept', auth, acceptInvite);
router.post('/reject', auth, rejectInvite);
router.get('/info', getInviteInfo); // No auth - public link
router.get('/project/:projectId', auth, getProjectInvites);
router.delete('/:inviteId', auth, cancelInvite);

export default router;
