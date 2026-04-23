import prisma from '../lib/prisma.js';

export const getMyNotifications = async(req,res)=>{
  const data = await prisma.notification.findMany({
    where:{ userId:req.user.id },
    orderBy:{ createdAt:'desc' }
  });

  res.json(data);
};

export const markRead = async(req,res)=>{
  const { id } = req.params;

  const item = await prisma.notification.update({
    where:{ id },
    data:{ isRead:true }
  });

  res.json(item);
};