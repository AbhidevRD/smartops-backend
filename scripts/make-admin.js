import 'dotenv/config';
import prisma from '../src/lib/prisma.js';

async function makeAdmin() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  if (!email) {
    console.error('Usage: node scripts/make-admin.js user@example.com');
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error('User not found:', email);
      process.exit(1);
    }

    const updated = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' }
    });

    console.log('Promoted to ADMIN:', updated.email, updated.id);
    process.exit(0);
  } catch (err) {
    console.error('Error promoting user:', err.message);
    process.exit(1);
  }
}

makeAdmin();
