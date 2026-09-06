import { processOperationalMail } from "../src/server/site-mail";

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

while (!stopping) {
  try { await processOperationalMail(); }
  catch (error) { console.error("Operational mail worker cycle failed", error instanceof Error ? error.message : "Unknown error"); }
  await new Promise((resolve) => setTimeout(resolve, 15_000));
}
