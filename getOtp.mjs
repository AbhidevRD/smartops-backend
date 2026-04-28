import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    // First find the user
    const user = await prisma.user.findUnique({
      where: { email: 'testuser@example.com' }
    });
    
    console.log("User:", JSON.stringify(user, null, 2));
    
    if (user) {
      // Use prisma to inspect token hashes only in dev
      const otpToken = await prisma.otpToken.findFirst({
        where: { userId: user.id, used: false, type: 'EMAIL_VERIFY' },
        orderBy: { createdAt: 'desc' }
      });

      console.log("\nOTP Token (hash only):", JSON.stringify({ id: otpToken?.id, tokenHash: otpToken?.tokenHash }, null, 2));
    }
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
