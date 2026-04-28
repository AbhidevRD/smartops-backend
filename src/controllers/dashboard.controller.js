import prisma from '../lib/prisma.js';

export const stats = async(req,res)=>{
  const totalProjects = await prisma.project.count({
    where:{ ownerId:req.user.id }
  });

  const totalTasks = await prisma.task.count();

  const completed = await prisma.task.count({
    where:{ status:'DONE' }
  });

  res.json({
    totalProjects,
    totalTasks,
    completed
  });
};

export const activity = async(req,res)=>{
  try {
    const recentActivity = await prisma.activityLog.findMany({
      where: {
        userId: req.user.id
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });

    res.json(recentActivity || []);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch activity',
      detail: error.message
    });
  }
};