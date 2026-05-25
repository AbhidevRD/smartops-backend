import prisma from '../lib/prisma.js';

export function isProjectAdminRole(role) {
  return role === 'ADMIN' || role === 'OWNER';
}

export async function getProjectMembership(projectId, userId) {
  return prisma.projectMember.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId
      }
    }
  });
}

export async function requireProjectMember(projectId, user) {
  console.log(`[Access] Checking membership for User:${user?.id} on Project:${projectId}`);
  
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true }
  });

  if (!project) {
    console.log(`[Access] Project ${projectId} not found`);
    const error = new Error('Project not found');
    error.statusCode = 404;
    throw error;
  }

  if (user.role === 'ADMIN' || project.ownerId === user.id) {
    console.log(`[Access] User ${user.id} is Admin or Owner`);
    return { project, membership: null };
  }

  const membership = await getProjectMembership(projectId, user.id);

  if (!membership) {
    console.log(`[Access] User ${user.id} NOT a member of ${projectId}`);
    const error = new Error('You are not a member of this project');
    error.statusCode = 403;
    throw error;
  }

  console.log(`[Access] User ${user.id} is a member of ${projectId}`);
  return { project, membership };
}

export async function requireProjectAdmin(projectId, user) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true }
  });

  if (!project) {
    const error = new Error('Project not found');
    error.statusCode = 404;
    throw error;
  }

  if (user.role === 'ADMIN' || project.ownerId === user.id) {
    return { project, membership: null };
  }

  const membership = await getProjectMembership(projectId, user.id);

  if (!membership || !isProjectAdminRole(membership.role)) {
    const error = new Error('Only project admins can perform this action');
    error.statusCode = 403;
    throw error;
  }

  return { project, membership };
}

export function sendAccessError(res, error) {
  return res.status(error.statusCode || 500).json({
    error: error.message || 'Access check failed'
  });
}
