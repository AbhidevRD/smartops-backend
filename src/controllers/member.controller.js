import prisma from '../lib/prisma.js';
import { requireProjectAdmin, requireProjectMember, sendAccessError } from '../utils/projectAccess.js';

function formatMember(member) {
  return {
    id: member.id,
    userId: member.userId,
    projectId: member.projectId,
    role: member.role,
    createdAt: member.createdAt,
    name: member.user.name,
    email: member.user.email,
    user: member.user
  };
}

export const getProjectMembers = async (req, res) => {
  try {
    const projectId = req.params.projectId || req.params.id;

    try {
      await requireProjectMember(projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const members = await prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true
          }
        }
      }
    });

    res.json(members.map(formatMember));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addProjectMember = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userId, role = 'MEMBER' } = req.body;
    const normalizedRole = role?.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'MEMBER';

    try {
      await requireProjectAdmin(projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId,
        userId,
        role: normalizedRole
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true
          }
        }
      }
    });

    res.status(201).json(formatMember(member));
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'User is already a member of this project' });
    }
    res.status(500).json({ error: error.message });
  }
};

export const updateProjectMember = async (req, res) => {
  try {
    const { projectId, memberId } = req.params;
    const { role } = req.body;
    const normalizedRole = role?.toUpperCase();

    if (!['ADMIN', 'MEMBER'].includes(normalizedRole)) {
      return res.status(400).json({ error: 'Role must be ADMIN or MEMBER' });
    }

    try {
      await requireProjectAdmin(projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const member = await prisma.projectMember.update({
      where: { id: memberId },
      data: { role: normalizedRole },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            role: true
          }
        }
      }
    });

    res.json(formatMember(member));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const removeProjectMember = async (req, res) => {
  try {
    const { projectId, memberId } = req.params;

    try {
      await requireProjectAdmin(projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    await prisma.projectMember.delete({
      where: { id: memberId }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTeamStats = async (req, res) => {
  try {
    const { projectId } = req.params;

    try {
      await requireProjectMember(projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const stats = await prisma.projectMember.aggregate({
      where: { projectId },
      _count: true
    });

    res.json({
      totalMembers: stats._count,
      projectId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
