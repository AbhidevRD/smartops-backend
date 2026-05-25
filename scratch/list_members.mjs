import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function listMembers() {
  try {
    const members = await prisma.projectMember.findMany({
      where: { projectId: 'b9008d00-c211-45e3-bf98-59d3981ed101' },
      include: { user: true }
    });
    
    console.log(`Members of b9008d00-c211-45e3-bf98-59d3981ed101:`);
    members.forEach(m => {
      console.log(`- User: ${m.user.email}, ID: ${m.userId}, Role: ${m.role}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

listMembers();
