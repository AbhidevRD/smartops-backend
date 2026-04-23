import express from 'express';
import auth from '../middleware/auth.middleware.js';
import {
 createProject,
 getProjects
} from '../controllers/project.controller.js';

const router = express.Router();

router.post('/', auth, createProject);
router.get('/', auth, getProjects);

export default router;