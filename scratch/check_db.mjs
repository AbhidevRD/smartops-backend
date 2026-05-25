import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkUserAndProject() {
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'abhivasudev2005@gmail.com' }
    });
    
    if (!user) {
      console.log('User abhivasudev2005@gmail.com not found');
      const allUsers = await prisma.user.findMany({ take: 5 });
      console.log('Sample users:', allUsers.map(u => ({ email: u.email, role: u.role })));
      return;
    }

    console.log(`User: ${user.email}, ID: ${user.id}, Role: ${user.role}`);

    const memberships = await prisma.projectMember.findMany({
      where: { userId: user.id },
      include: { project: true }
    });

    console.log('Memberships:');
    memberships.forEach(m => {
      console.log(`- Project: ${m.project.name}, ID: ${m.projectId}, Role: ${m.role}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserAndProject();
