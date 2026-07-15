import { prepareDemoFixtures } from "../src/modules/demo/demoFixtures";

async function main() {
  const result = await prepareDemoFixtures();

  console.log(`Fixtures demo preparados em ${result.directory}`);
  for (const file of result.files) {
    console.log(
      `${file.fileName} | company=${file.companyId} | account=${file.bankAccountId} | transactions=${file.transactionCount}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
