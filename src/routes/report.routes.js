import express from 'express';
import auth from '../middleware/auth.middleware.js';
import {
  listReports,
  projectReport,
  downloadProjectReport,
  generateReport
} from '../controllers/report.controller.js';

const router = express.Router();

router.get('/', auth, listReports);
router.get('/project/:id', auth, projectReport);
router.get('/project/:id/download', auth, downloadProjectReport);
router.post('/generate', auth, generateReport);

export default router;
