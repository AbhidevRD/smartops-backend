import prisma from '../lib/prisma.js';

export const getActivity = async(req,res)=>{
  const logs = await prisma.activityLog.findMany({
    orderBy:{ createdAt:'desc' },
    take:50,
    include:{
      user:{
        select:{
          name:true
        }
      }
    }
  });

  res.json(logs);
};