import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma from '../lib/prisma.js';
import { fileUrl } from '../middleware/upload.middleware.js';
import { requireProjectMember, sendAccessError } from '../utils/projectAccess.js';
import { emitToProject } from '../services/realtime.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fileInclude = {
  uploadedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
};

// POST /api/files/upload
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { projectId, taskId, description, tags, versionNote } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    // Verify membership
    try {
      await requireProjectMember(projectId, req.user);
    } catch (accessError) {
      // Remove orphaned file on access denial
      fs.unlink(req.file.path, () => {});
      return sendAccessError(res, accessError);
    }

    // If taskId provided, verify it belongs to the project
    if (taskId) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { projectId: true },
      });
      if (!task || task.projectId !== projectId) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Task does not belong to this project' });
      }
    }

    const url = fileUrl(req, req.file.filename);

    const file = await prisma.file.create({
      data: {
        url,
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
        projectId,
        taskId: taskId || null,
        uploadedById: req.user.id,
        description: description || null,
        tags: tags || null,
        versionNote: versionNote || null,
      },
      include: fileInclude,
    });

    emitToProject(projectId, 'file-uploaded', file);

    res.status(201).json(file);
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: error.message });
  }
};

// GET /api/files/project/:projectId
export const getProjectFiles = async (req, res) => {
  try {
    const { projectId } = req.params;

    try {
      await requireProjectMember(projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const files = await prisma.file.findMany({
      where: { projectId },
      include: fileInclude,
      orderBy: { createdAt: 'desc' },
    });

    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/files/task/:taskId
export const getTaskFiles = async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    try {
      await requireProjectMember(task.projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const files = await prisma.file.findMany({
      where: { taskId },
      include: fileInclude,
      orderBy: { createdAt: 'desc' },
    });

    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/files/:id/download
export const downloadFile = async (req, res) => {
  try {
    const { id } = req.params;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    try {
      await requireProjectMember(file.projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    // Resolve disk path from stored filename
    const filename = path.basename(new URL(file.url).pathname);
    const filePath = path.join(__dirname, '../../uploads', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Type', file.type);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PATCH /api/files/:id
export const updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { description, tags, versionNote } = req.body;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Only uploader, project admin, or system admin can edit
    if (file.uploadedById !== req.user.id && req.user.role !== 'ADMIN') {
      const membership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: file.projectId, userId: req.user.id } },
      });
      if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
        return res.status(403).json({ error: 'Only the uploader or project admin can edit this file' });
      }
    }

    const updatedFile = await prisma.file.update({
      where: { id },
      data: {
        description: description !== undefined ? description : file.description,
        tags: tags !== undefined ? tags : file.tags,
        versionNote: versionNote !== undefined ? versionNote : file.versionNote,
      },
      include: fileInclude,
    });

    emitToProject(file.projectId, 'file-updated', updatedFile);

    res.json(updatedFile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/files/:id
export const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Only uploader or system ADMIN can delete
    if (file.uploadedById !== req.user.id && req.user.role !== 'ADMIN') {
      // Check if project admin
      const membership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: file.projectId, userId: req.user.id } },
      });
      if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'OWNER')) {
        return res.status(403).json({ error: 'Only the uploader or project admin can delete this file' });
      }
    }

    // Remove from disk
    try {
      const filename = path.basename(new URL(file.url).pathname);
      const filePath = path.join(__dirname, '../../uploads', filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // Non-fatal: continue with DB delete even if disk file is missing
    }

    await prisma.file.delete({ where: { id } });

    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
