import prisma from '../src/lib/prisma.js';
import bcrypt from 'bcrypt';

async function seedTestUser() {
  try {
    // Check if test user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'test@smartops.ai' }
    });

    if (existingUser) {
      console.log('✅ Test user already exists');
      return;
    }

    // Create test user
    const passwordHash = await bcrypt.hash('password123', 10);
    const testUser = await prisma.user.create({
      data: {
        email: 'test@smartops.ai',
        name: 'Test User',
        passwordHash,
        role: 'MEMBER'
      }
    });

    console.log('✅ Test user created:', testUser.email);
    console.log('   Email: test@smartops.ai');
    console.log('   Password: password123');
  } catch (error) {
    console.error('❌ Error seeding test user:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedTestUser();
