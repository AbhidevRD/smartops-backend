import prisma from '../lib/prisma.js';
import logActivity from '../utils/logActivity.js';

export const addComment = async(req,res)=>{
  try{
    const { taskId } = req.params;
    const { message } = req.body;

    const comment = await prisma.taskComment.create({
      data:{
        taskId,
        userId:req.user.id,
        message
      }
    });

    await logActivity(
      'COMMENT_ADDED',
      req.user.id,
      null,
      message
    );

    res.status(201).json(comment);

  }catch(error){
    res.status(500).json({ error:error.message });
  }
};

export const getComments = async(req,res)=>{
  const { taskId } = req.params;

  const comments = await prisma.taskComment.findMany({
    where:{ taskId },
    include:{
      user:{
        select:{
          name:true,
          email:true
        }
      }
    },
    orderBy:{ createdAt:'asc' }
  });

  res.json(comments);
};