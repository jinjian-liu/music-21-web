import "dotenv/config";
import { buildApp } from "./app";
import { pool } from "./db";
const app = await buildApp();
app.addHook("onClose", async () => {
  await pool.end();
});
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => void app.close());
await app.listen({
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || "127.0.0.1",
});
