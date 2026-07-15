import { prisma } from "../src/lib/prisma";
import {
  clearDemoUploadDirectories,
  ensureDemoSeed,
  resetDemoOperationalData,
} from "../src/modules/demo/demoSetup";

async function main() {
  await ensureDemoSeed(prisma);
  const summary = await resetDemoOperationalData(prisma);
  await clearDemoUploadDirectories();

  console.log(`Demo reset concluido para: ${summary.companyIds.join(", ")}`);
  for (const [key, value] of Object.entries(summary.deleted)) {
    console.log(`${key}: ${value}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
