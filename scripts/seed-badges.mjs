import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { seedDefaultBadges } from '../src/services/badge.service.js';

try {
  const badges = await seedDefaultBadges();
  console.log(`Seeded ${badges.length} default badges`);
} catch (error) {
  console.error('Failed to seed badges:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
