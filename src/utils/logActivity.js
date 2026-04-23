import prisma from '../lib/prisma.js';

export default async function logActivity(
  action,
  userId = null,
  projectId = null,
  details = null
){
  await prisma.activityLog.create({
    data:{
      action,
      userId,
      projectId,
      details
    }
  });
}