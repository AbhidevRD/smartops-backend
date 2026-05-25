import express from 'express';
import auth from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import {
  uploadFile,
  getProjectFiles,
  getTaskFiles,
  downloadFile,
  updateFile,
  deleteFile,
} from '../controllers/file.controller.js';

const router = express.Router();

// Upload a file (multipart/form-data)
router.post('/upload', auth, upload.single('file'), uploadFile);

// Get all files for a project
router.get('/project/:projectId', auth, getProjectFiles);

// Get all files for a task
router.get('/task/:taskId', auth, getTaskFiles);

// Download a specific file
router.get('/:id/download', auth, downloadFile);

// Update file metadata
router.patch('/:id', auth, updateFile);

// Delete a file
router.delete('/:id', auth, deleteFile);

export default router;
