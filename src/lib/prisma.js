import { PrismaClient } from '@prisma/client';

// Validate database configuration
function validateDatabaseConfig() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    throw new Error('DATABASE_URL not set in environment variables. Configure Supabase PostgreSQL connection.');
  }

  // Check for SQLite (should not be used)
  if (dbUrl.includes('file:') || dbUrl.includes('sqlite')) {
    console.warn('⚠️  WARNING: SQLite database detected! Please configure Supabase PostgreSQL instead.');
    console.warn('Update DATABASE_URL to PostgreSQL format in .env');
    throw new Error('SQLite is not supported. Please use Supabase PostgreSQL database.');
  }

  // Validate PostgreSQL URL format
  if (!dbUrl.includes('postgresql://') && !dbUrl.includes('postgres://')) {
    throw new Error('Invalid DATABASE_URL format. Expected PostgreSQL connection string.');
  }

  console.log('✓ Database configuration validated: PostgreSQL');
}

// Validate on module load
validateDatabaseConfig();

const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    errorFormat: 'minimal'
  });

// Test database connection — non-fatal (warns but does not crash the server)
async function testDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✓ Connected to Supabase PostgreSQL database');
  } catch (error) {
    console.warn('⚠️  Database connection test failed (non-fatal):');
    console.warn('   Error:', error.message);
    console.warn('   The server will continue — DB may be reachable for app requests.');
    console.warn('   Verify DATABASE_URL in .env if you see errors during requests.');
  }
}

// Run connection test on startup (skip with TEST_DB_CONNECTION=false)
if (process.env.TEST_DB_CONNECTION !== 'false') {
  testDatabaseConnection().catch(() => {});
}

// Ensure we reuse the singleton in development
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export default prisma;