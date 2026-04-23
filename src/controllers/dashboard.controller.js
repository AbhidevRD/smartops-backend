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