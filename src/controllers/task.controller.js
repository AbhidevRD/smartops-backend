import prisma from '../lib/prisma.js';
import { emitToProject } from '../services/realtime.service.js';
import { requireProjectMember, sendAccessError } from '../utils/projectAccess.js';
import { createNotification } from '../services/notification.service.js';

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  project: { select: { id: true, name: true } },
  comments: { select: { id: true, message: true, user: { select: { name: true } } } },
  files: { select: { id: true, name: true, url: true, type: true, size: true, createdAt: true, uploadedBy: { select: { id: true, name: true } } } },
};

async function getAccessibleProjectIds(userId) {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true }
  });

  return memberships.map(member => member.projectId);
}

function normalizeTaskStatus(status) {
  if (!status) {
    return undefined;
  }

  const normalized = status.toUpperCase().replace(/-/g, '_');

  if (normalized === 'COMPLETED') {
    return 'DONE';
  }

  return normalized;
}

export const createTask = async(req,res)=>{
  try{
    const {
      title,
      description,
      projectId,
      assigneeId,
      priority,
      deadline,
      dueDate
    } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    // Get membership info (also validates membership)
    let membership = null;
    try {
      const access = await requireProjectMember(projectId, req.user);
      membership = access.membership;
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    // Only project admin/owner (or global ADMIN) can assign tasks
    if (assigneeId) {
      const isGlobalAdmin = req.user.role === 'ADMIN';
      const isProjectAdmin = membership
        ? membership.role === 'ADMIN' || membership.role === 'OWNER'
        : true; // ownerId match (membership === null) means owner

      if (!isGlobalAdmin && !isProjectAdmin) {
        return res.status(403).json({ error: 'Only project admins can assign tasks to other members' });
      }

      // Validate assignee is a member of the project
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
      const isOwner = project?.ownerId === assigneeId;
      if (!isOwner) {
        const assigneeMembership = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: assigneeId } },
        });
        if (!assigneeMembership) {
          return res.status(400).json({ error: 'Assignee is not a member of this project' });
        }
      }
    }

    // Normalize priority to uppercase enum value
    const normalizedPriority = priority ? priority.toUpperCase() : 'MEDIUM';
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH'];

    if (!validPriorities.includes(normalizedPriority)) {
      return res.status(400).json({ error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` });
    }

    const task = await prisma.task.create({
      data:{
        title,
        description,
        projectId,
        assigneeId: assigneeId || null,
        priority: normalizedPriority,
        deadline: deadline || dueDate ? new Date(deadline || dueDate) : null
      },
      include: taskInclude
    });

    emitToProject(projectId, 'task-created', task);

    // Notify the assignee (if assigned to someone other than creator)
    if (assigneeId && assigneeId !== req.user.id) {
      const assigneeName = task.assignee?.name || 'You';
      await createNotification(
        assigneeId,
        '📌 Task Assigned to You',
        `"${task.title}" in project "${task.project?.name || 'Unknown'}" has been assigned to you by ${req.user.name || 'a team member'}.`
      );
    }

    res.status(201).json(task);

  }catch(error){
    res.status(500).json({ error:error.message });
  }
};

export const getTasks = async(req,res)=>{
  try {
    const {
      projectId,
      status,
      priority,
      search
    } = req.query;

    // Normalize enum query params to uppercase for Prisma
    const normalizedStatus = normalizeTaskStatus(status);
    const normalizedPriority = priority ? priority.toUpperCase() : undefined;
    let projectFilter = {};

    if (projectId) {
      try {
        await requireProjectMember(projectId, req.user);
      } catch (accessError) {
        return sendAccessError(res, accessError);
      }
      projectFilter = { projectId };
    } else {
      const accessibleProjectIds = await getAccessibleProjectIds(req.user.id);
      projectFilter = { projectId: { in: accessibleProjectIds } };
    }

    const tasks = await prisma.task.findMany({
      where:{
        ...projectFilter,
        status: normalizedStatus,
        priority: normalizedPriority,
        title: search
          ? { contains: search, mode:'insensitive' }
          : undefined
      },
      include: taskInclude,
      orderBy: { createdAt: 'desc' }
    });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTask = async(req,res)=>{
  try {
    const { id } = req.params;
    
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        project: { select: { id: true, name: true } },
        comments: { 
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    try {
      await requireProjectMember(task.projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTask = async(req,res)=>{
  try {
    const { id } = req.params;
    const { title, description, priority, deadline, dueDate, assigneeId, status } = req.body;

    const existingTask = await prisma.task.findUnique({
      where: { id },
      select: { id: true, projectId: true, assigneeId: true },
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    let membership = null;
    try {
      const access = await requireProjectMember(existingTask.projectId, req.user);
      membership = access.membership;
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    // Only project admin/owner can reassign tasks
    if (assigneeId !== undefined && assigneeId !== existingTask.assigneeId) {
      const isGlobalAdmin = req.user.role === 'ADMIN';
      const isProjectAdmin = membership
        ? membership.role === 'ADMIN' || membership.role === 'OWNER'
        : true;

      if (!isGlobalAdmin && !isProjectAdmin) {
        return res.status(403).json({ error: 'Only project admins can reassign tasks' });
      }

      if (assigneeId) {
        const project = await prisma.project.findUnique({ where: { id: existingTask.projectId }, select: { ownerId: true } });
        const isOwner = project?.ownerId === assigneeId;
        if (!isOwner) {
          const assigneeMembership = await prisma.projectMember.findUnique({
            where: { projectId_userId: { projectId: existingTask.projectId, userId: assigneeId } },
          });
          if (!assigneeMembership) {
            return res.status(400).json({ error: 'Assignee is not a member of this project' });
          }
        }
      }
    }

    // Normalize priority to uppercase enum value
    let normalizedPriority = undefined;
    if (priority !== undefined) {
      normalizedPriority = priority.toUpperCase();
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH'];
      if (!validPriorities.includes(normalizedPriority)) {
        return res.status(400).json({ error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` });
      }
    }

    // Normalize status to uppercase enum value
    let normalizedStatus = undefined;
    if (status !== undefined) {
      normalizedStatus = normalizeTaskStatus(status);
      const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];
      if (!validStatuses.includes(normalizedStatus)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        title,
        description,
        priority: normalizedPriority,
        status: normalizedStatus,
        deadline: deadline || dueDate ? new Date(deadline || dueDate) : undefined,
        assigneeId: assigneeId !== undefined ? (assigneeId || null) : undefined,
        completedAt: normalizedStatus === 'DONE' ? new Date() : normalizedStatus ? null : undefined,
      },
      include: taskInclude
    });

    emitToProject(task.projectId, 'task-updated', task);

    // Notify the new assignee if task was reassigned
    if (assigneeId !== undefined && assigneeId !== existingTask.assigneeId && assigneeId && assigneeId !== req.user.id) {
      await createNotification(
        assigneeId,
        '📌 Task Assigned to You',
        `"${task.title}" has been assigned to you by ${req.user.name || 'a team member'}.`
      );
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTask = async(req,res)=>{
  try {
    const { id } = req.params;

    const existingTask = await prisma.task.findUnique({
      where: { id },
      select: { id: true, projectId: true }
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    try {
      await requireProjectMember(existingTask.projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    await prisma.task.delete({
      where: { id }
    });

    emitToProject(existingTask.projectId, 'task-deleted', { id, projectId: existingTask.projectId });
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTaskStatus = async(req,res)=>{
  try {
    const { id } = req.params;
    const { status } = req.body;

    const existingTask = await prisma.task.findUnique({
      where: { id },
      select: { id: true, projectId: true }
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    try {
      await requireProjectMember(existingTask.projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    // Normalize and validate status
    const mappedStatus = normalizeTaskStatus(status);
    const validStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];

    if (!mappedStatus || !validStatuses.includes(mappedStatus)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        status: mappedStatus,
        completedAt: mappedStatus === 'DONE' ? new Date() : null
      },
      include: taskInclude
    });

    await prisma.activityLog.create({
      data: {
        action: 'TASK_STATUS_UPDATED',
        details: `${req.user.name} changed status of task "${task.title}" to ${mappedStatus}`,
        userId: req.user.id,
        projectId: task.projectId
      }
    });

    // Award XP points if task completed
    if (mappedStatus === 'DONE' && task.assigneeId) {
      await prisma.user.update({
        where: { id: task.assigneeId },
        data: { xpPoints: { increment: 10 } }
      });
    }

    emitToProject(task.projectId, 'task-updated', task);
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
