import { defaultCmsSnapshot } from "../src/lib/cms";
import { saveCmsSnapshot } from "../src/server/cms";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed CH Elevate content.");
  }

  await saveCmsSnapshot(defaultCmsSnapshot, "system:ch-elevate-copy-blueprint");
  console.log("CH Elevate CMS content seeded.");
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
