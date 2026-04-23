import prisma from '../lib/prisma.js';

export const projectReport = async(req,res)=>{
  const { id } = req.params;

  const project = await prisma.project.findUnique({
    where:{ id },
    include:{
      tasks:true,
      members:true
    }
  });

  res.json({
    projectName: project.name,
    totalTasks: project.tasks.length,
    completed: project.tasks.filter(
      t => t.status === 'DONE'
    ).length
  });
};