import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { pool } from "./db";
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(210022)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  // The original migrator did not track migrations. Adopt an existing v1 database.
  const existing = (
    await client.query("SELECT to_regclass('public.pieces') AS name")
  ).rows[0].name;
  if (existing)
    await client.query(
      "INSERT INTO schema_migrations(name) VALUES('0001_midi_platform.sql') ON CONFLICT DO NOTHING",
    );
  const dir = new URL("./migrations/", import.meta.url);
  for (const name of (await readdir(dir))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    if (
      (
        await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    )
      continue;
    await client.query("BEGIN");
    try {
      await client.query(await readFile(new URL(name, dir), "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
      await client.query("COMMIT");
      console.log("Applied", name);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(210022)");
  client.release();
  await pool.end();
}
