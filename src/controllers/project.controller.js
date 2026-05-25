import prisma from '../lib/prisma.js';
import { requireProjectAdmin, requireProjectMember, sendAccessError } from '../utils/projectAccess.js';
import { generateUniqueJoinCode } from '../utils/joinCode.js';
import { emitToProject, getSocketServer } from '../services/realtime.service.js';
import { createNotification } from '../services/notification.service.js';

export const createProject = async(req,res)=>{
  try{
    const { name, description } = req.body;

    const joinCode = await generateUniqueJoinCode();

    const project = await prisma.$transaction(async tx => {
      const created = await tx.project.create({
        data:{
          name,
          description,
          ownerId:req.user.id,
          joinCode
        }
      });

      await tx.projectMember.create({
        data:{
          projectId:created.id,
          userId:req.user.id,
          role:'ADMIN'
        }
      });

      return created;
    });

    // Notify the creator
    await createNotification(
      req.user.id,
      '🎉 Project Created',
      `Your project "${project.name}" has been created successfully.`
    );

    res.status(201).json(project);

  }catch(error){
    res.status(500).json({ error:error.message });
  }
};

export const getProjects = async(req,res)=>{
  try {
    const projects = await prisma.project.findMany({
      where:{
        members:{
          some:{
            userId:req.user.id
          }
        }
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
        _count: { select: { tasks: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch per-status task counts for all projects in one query
    const projectIds = projects.map(p => p.id);
    const taskCounts = await prisma.task.groupBy({
      by: ['projectId', 'status'],
      where: { projectId: { in: projectIds } },
      _count: { id: true }
    });

    // Build lookup: { projectId: { TODO, IN_PROGRESS, DONE } }
    const statusMap = {};
    for (const row of taskCounts) {
      if (!statusMap[row.projectId]) statusMap[row.projectId] = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
      statusMap[row.projectId][row.status] = row._count.id;
    }

    res.json(projects.map(project => ({
      ...project,
      taskCount: project._count.tasks,
      memberCount: project.members.length,
      taskStats: {
        todo:       statusMap[project.id]?.TODO        || 0,
        inProgress: statusMap[project.id]?.IN_PROGRESS || 0,
        done:       statusMap[project.id]?.DONE        || 0,
      }
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getProject = async(req,res)=>{
  try {
    const { id } = req.params;

    try {
      await requireProjectMember(id, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        members: { 
          include: { 
            user: { select: { id: true, name: true, email: true, avatarUrl: true } } 
          }
        },
        tasks: {
          select: { id: true, title: true, status: true, priority: true, deadline: true },
          take: 10,
          orderBy: { createdAt: 'desc' }
        },
        _count: { select: { tasks: true, members: true } }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProject = async(req,res)=>{
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    try {
      await requireProjectAdmin(id, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const updated = await prisma.project.update({
      where: { id },
      data: {
        name,
        description
      },
      include: {
        owner: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true } } } }
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteProject = async(req,res)=>{
  try {
    const { id } = req.params;

    try {
      await requireProjectAdmin(id, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    // Get project name before deletion for notification
    const project = await prisma.project.findUnique({
      where: { id },
      select: { name: true, members: { select: { userId: true } } }
    });

    await prisma.project.delete({ where: { id } });

    // Notify all members via socket that this project was deleted
    const io = getSocketServer();
    if (io) {
      io.to(id).emit('project-deleted', { projectId: id, projectName: project?.name });
    }

    res.json({ success: true, message: 'Project deleted', projectId: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Join project using join code
 * POST /api/project/join
 */
export const joinProjectByCode = async(req, res) => {
  try {
    const { joinCode } = req.body;
    const userId = req.user.id;

    if (!joinCode || !joinCode.trim()) {
      return res.status(400).json({ error: 'Join code is required' });
    }

    // Find project by join code
    const project = await prisma.project.findUnique({
      where: { joinCode: joinCode.trim().toUpperCase() }
    });

    if (!project) {
      return res.status(404).json({ error: 'Invalid join code' });
    }

    // Check if user is already a member
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId
        }
      }
    });

    if (existingMember) {
      // Return 200 instead of 400 to allow frontend to sync gracefully
      return res.status(200).json({ 
        success: true,
        message: 'You are already a member of this project',
        project: project,
        alreadyMember: true
      });
    }

    // Add user as member
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId,
        role: 'MEMBER'
      }
    });

    // Return project details
    const updatedProject = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
        members: { 
          include: { 
            user: { select: { id: true, name: true, email: true, avatarUrl: true } } 
          }
        },
        _count: { select: { tasks: true, members: true } }
      }
    });

    // Emit real-time event to project room
    emitToProject(project.id, 'member-joined', {
      projectId: project.id,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email
      }
    });

    // Also notify the new member's personal room
    const io = getSocketServer();
    if (io) {
      io.to(`user:${req.user.id}`).emit('joined-project', {
        projectId: project.id,
        project: updatedProject
      });
    }

    res.status(201).json({
      success: true,
      message: 'Successfully joined project',
      project: updatedProject
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get project join code (only for members)
 * GET /api/project/:id/code
 */
export const getProjectCode = async(req, res) => {
  try {
    const { id } = req.params;

    try {
      await requireProjectMember(id, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const project = await prisma.project.findUnique({
      where: { id },
      select: { joinCode: true, name: true, id: true }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ 
      projectId: project.id,
      projectName: project.name,
      joinCode: project.joinCode
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Regenerate project join code (admin only)
 * PATCH /api/project/:id/regenerate-code
 */
export const regenerateProjectCode = async(req, res) => {
  try {
    const { id } = req.params;

    try {
      await requireProjectAdmin(id, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const newJoinCode = await generateUniqueJoinCode();

    const updated = await prisma.project.update({
      where: { id },
      data: { joinCode: newJoinCode },
      select: { 
        id: true,
        name: true,
        joinCode: true,
        ownerId: true
      }
    });

    res.json({
      success: true,
      message: 'Join code regenerated successfully',
      project: updated
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

