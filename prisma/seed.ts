import { PrismaClient } from "@prisma/client";
import { ensureDemoSeed } from "../src/modules/demo/demoSetup";

const prisma = new PrismaClient();

async function main() {
  await ensureDemoSeed(prisma);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
