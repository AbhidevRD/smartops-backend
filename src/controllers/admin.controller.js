import prisma from '../lib/prisma.js';

export const getUsers = async(req,res)=>{
  const users = await prisma.user.findMany({
    select:{
      id:true,
      name:true,
      email:true,
      role:true,
      isVerified:true
    }
  });

  res.json(users);
};

export const changeRole = async(req,res)=>{
  const { id } = req.params;
  const { role } = req.body;

  const user = await prisma.user.update({
    where:{ id },
    data:{ role }
  });

  res.json(user);
};