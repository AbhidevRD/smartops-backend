import prisma from '../lib/prisma.js';
export const sendMessage =
async(req,res)=>{
  try{

    const senderId = req.user.id;

    const {
      projectId,
      message
    } = req.body;

    const msg =
      await prisma.groupMessage.create({
        data:{
          projectId,
          senderId,
          message
        }
      });

    res.json({
      success:true,
      data:msg
    });

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};

export const getMessages =
async(req,res)=>{
  try{

    const { projectId } =
      req.params;

    const messages =
      await prisma.groupMessage.findMany({
        where:{ projectId },
        orderBy:{
          createdAt:'asc'
        }
      });

    res.json(messages);

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};

export const markRead =
async(req,res)=>{
  try{

    const { id } = req.params;

    const message =
      await prisma.groupMessage.update({
        where:{ id },
        data:{ isRead: true }
      });

    res.json({
      success: true,
      data: message
    });

  }catch(error){
    res.status(500).json({
      error:error.message
    });
  }
};