import { PrismaClient } from '@prisma/client';

const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    errorFormat: 'minimal'
  });

// Ensure we reuse the singleton in development
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;