import "dotenv/config";
import { processNextJob, processCleanup } from "./parse-worker";
import { pool } from "./db";
let stop = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    stop = true;
  });
while (!stop) {
  try {
    await processNextJob();
    await processCleanup();
  } catch (e) {
    console.error("Worker failure", e);
  }
  if (!stop) await new Promise((resolve) => setTimeout(resolve, 1500));
}
await pool.end();
