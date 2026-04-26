import prisma from '../lib/prisma.js';

export const createTask = async(req,res)=>{
  try{
    const {
      title,
      description,
      projectId,
      assigneeId,
      priority,
      deadline
    } = req.body;

    const task = await prisma.task.create({
      data:{
        title,
        description,
        projectId,
        assigneeId,
        priority,
        deadline: deadline ? new Date(deadline) : null
      }
    });

    res.status(201).json(task);

  }catch(error){
    res.status(500).json({ error:error.message });
  }
};

export const getTasks = async(req,res)=>{
  const {
    projectId,
    status,
    priority,
    search
  } = req.query;

  const tasks = await prisma.task.findMany({
    where:{
      projectId,
      status: status || undefined,
      priority: priority || undefined,
      title: search
        ? { contains: search, mode:'insensitive' }
        : undefined
    }
  });

  res.json(tasks);
};

export const updateTaskStatus = async(req,res)=>{
  const { id } = req.params;
  const { status } = req.body;

  const task = await prisma.task.update({
    where:{ id: task.assigneeId },
    data:{  status,
  completedAt: status === 'DONE'
    ? new Date()
    : null } ,xpPoints:{
      increment:10
    }
  });

  res.json(task);
};