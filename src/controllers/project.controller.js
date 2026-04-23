import prisma from '../lib/prisma.js';

export const createProject = async(req,res)=>{
  try{
    const { name, description } = req.body;

    const project = await prisma.project.create({
      data:{
        name,
        description,
        ownerId:req.user.id
      }
    });

    await prisma.projectMember.create({
      data:{
        projectId:project.id,
        userId:req.user.id,
        role:'OWNER'
      }
    });

    res.status(201).json(project);

  }catch(error){
    res.status(500).json({ error:error.message });
  }
};

export const getProjects = async(req,res)=>{
  const projects = await prisma.project.findMany({
    where:{
      members:{
        some:{
          userId:req.user.id
        }
      }
    }
  });

  res.json(projects);
};