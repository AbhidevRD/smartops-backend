import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkProjectOwner() {
  try {
    const project = await prisma.project.findUnique({
      where: { id: 'b9008d00-c211-45e3-bf98-59d3981ed101' },
      include: { owner: true }
    });
    
    if (!project) {
      console.log('Project not found');
      return;
    }

    console.log(`Project: ${project.name}, Owner: ${project.owner.email}, OwnerID: ${project.ownerId}`);

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkProjectOwner();
