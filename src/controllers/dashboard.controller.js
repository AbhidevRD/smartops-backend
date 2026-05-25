import prisma from '../lib/prisma.js';

// Helper: get all project IDs the user belongs to (as owner or member)
async function getUserProjectIds(userId) {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true }
  });
  const ownedProjects = await prisma.project.findMany({
    where: { ownerId: userId },
    select: { id: true }
  });
  const memberIds = memberships.map(m => m.projectId);
  const ownerIds = ownedProjects.map(p => p.id);
  return [...new Set([...memberIds, ...ownerIds])];
}

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectIds = await getUserProjectIds(userId);

    const [
      totalProjects,
      totalTasks,
      completedTasks,
      inProgressTasks,
      overdueTasks,
      myTasks,
      recentActivity,
      teamMembers,
      upcomingDeadlines
    ] = await Promise.all([
      // Total projects user belongs to
      Promise.resolve(projectIds.length),

      // Total tasks across user's projects
      prisma.task.count({
        where: { projectId: { in: projectIds } }
      }),

      // Completed tasks
      prisma.task.count({
        where: { projectId: { in: projectIds }, status: 'DONE' }
      }),

      // In-progress tasks
      prisma.task.count({
        where: { projectId: { in: projectIds }, status: 'IN_PROGRESS' }
      }),

      // Overdue tasks (not done, deadline passed)
      prisma.task.count({
        where: {
          projectId: { in: projectIds },
          status: { not: 'DONE' },
          deadline: { lt: new Date() }
        }
      }),

      // Tasks assigned to me
      prisma.task.count({
        where: { assigneeId: userId, status: { not: 'DONE' } }
      }),

      // Recent activity
      prisma.activityLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { name: true, email: true, avatarUrl: true } }
        }
      }),

      // Unique team members across all user's projects
      prisma.projectMember.findMany({
        where: { projectId: { in: projectIds } },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        distinct: ['userId']
      }),

      // Upcoming deadlines (next 7 days)
      prisma.task.findMany({
        where: {
          projectId: { in: projectIds },
          status: { not: 'DONE' },
          deadline: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        },
        include: {
          assignee: { select: { name: true, avatarUrl: true } },
          project: { select: { name: true } }
        },
        orderBy: { deadline: 'asc' },
        take: 5
      })
    ]);

    const completionRate = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    res.json({
      stats: {
        totalProjects,
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks: totalTasks - completedTasks - inProgressTasks,
        overdueTasks,
        myActiveTasks: myTasks,
        completionRate,
        teamSize: new Set(teamMembers.map(m => m.userId)).size
      },
      upcomingDeadlines,
      recentActivity: recentActivity || []
    });

  } catch (error) {
    console.error('[Dashboard] Error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch dashboard',
      detail: error.message
    });
  }
};

export const stats = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectIds = await getUserProjectIds(userId);

    const [totalProjects, totalTasks, completedTasks, overdueTasks] = await Promise.all([
      Promise.resolve(projectIds.length),
      prisma.task.count({ where: { projectId: { in: projectIds } } }),
      prisma.task.count({ where: { projectId: { in: projectIds }, status: 'DONE' } }),
      prisma.task.count({
        where: {
          projectId: { in: projectIds },
          status: { not: 'DONE' },
          deadline: { lt: new Date() }
        }
      })
    ]);

    res.json({
      totalProjects,
      totalTasks,
      completed: completedTasks,
      pending: totalTasks - completedTasks,
      overdue: overdueTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    });

  } catch (error) {
    console.error('[Dashboard Stats] Error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch stats',
      detail: error.message
    });
  }
};

export const activity = async (req, res) => {
  try {
    const recentActivity = await prisma.activityLog.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: { select: { name: true, email: true, avatarUrl: true } }
      }
    });

    res.json(recentActivity || []);
  } catch (error) {
    console.error('[Dashboard Activity] Error:', error.message);
    res.status(500).json({
      error: 'Failed to fetch activity',
      detail: error.message
    });
  }
};
