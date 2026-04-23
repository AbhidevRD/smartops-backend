import express from 'express';
import auth from '../middleware/auth.middleware.js';
import { projectReport } from '../controllers/report.controller.js';

const router = express.Router();

router.get('/project/:id', auth, projectReport);

export default router;