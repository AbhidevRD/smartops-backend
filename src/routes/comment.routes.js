import express from 'express';
import auth from '../middleware/auth.middleware.js';

import {
 addComment,
 getComments
} from '../controllers/comment.controller.js';

const router = express.Router();

router.post('/:taskId', auth, addComment);
router.get('/:taskId', auth, getComments);

export default router;