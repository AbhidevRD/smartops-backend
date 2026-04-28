import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    // Disabled raw query to avoid accidental execution; token is not stored in plaintext.
    // If you need to inspect token hashes, use prisma.otpToken.findFirst() in a controlled script.
    const result = [];
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
