import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    // First, let's get the actual schema
    const columns = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'otp_tokens' AND table_schema = 'public';
    `;
    console.log("OTP Tokens Columns:", JSON.stringify(columns, null, 2));
    
    // Also check users table
    const userColumns = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND table_schema = 'public';
    `;
    console.log("\nUsers Columns:", JSON.stringify(userColumns, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
