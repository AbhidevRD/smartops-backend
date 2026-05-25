import prisma from '../lib/prisma.js';

export const getMyNotifications = async(req,res)=>{
  try {
    const data = await prisma.notification.findMany({
      where:{ userId:req.user.id },
      orderBy:{ createdAt:'desc' },
      take: 100
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const markRead = async(req,res)=>{
  try {
    const { id } = req.params;

    const item = await prisma.notification.update({
      where:{ id },
      data:{ isRead:true }
    });

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const markAllRead = async(req,res)=>{
  try {
    await prisma.notification.updateMany({
      where:{ userId: req.user.id, isRead: false },
      data:{ isRead: true }
    });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};