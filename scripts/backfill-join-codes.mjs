/**
 * Backfill script: generates join codes for any projects that have an empty joinCode.
 * Run: node scripts/backfill-join-codes.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function generateJoinCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function generateUniqueCode() {
  let code;
  let exists = true;
  while (exists) {
    code = generateJoinCode();
    const found = await prisma.project.findUnique({ where: { joinCode: code }, select: { id: true } });
    exists = !!found;
  }
  return code;
}

async function main() {
  // Find projects with empty joinCode (null not possible since it's non-nullable)
  const projectsWithoutCode = await prisma.project.findMany({
    where: { joinCode: '' },
    select: { id: true, name: true, joinCode: true }
  });

  if (projectsWithoutCode.length === 0) {
    console.log('✅ All projects already have join codes. Nothing to backfill.');
    return;
  }

  console.log(`Found ${projectsWithoutCode.length} project(s) without join codes. Generating...`);

  for (const project of projectsWithoutCode) {
    const newCode = await generateUniqueCode();
    await prisma.project.update({
      where: { id: project.id },
      data: { joinCode: newCode }
    });
    console.log(`  ✓ "${project.name}" (${project.id}) → ${newCode}`);
  }

  console.log('\n✅ Backfill complete!');
}

main()
  .catch((e) => {
    console.error('❌ Backfill failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
