import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL || "postgres://music:music@127.0.0.1:5432/music21";
export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.DB_POOL_SIZE || 10),
});
export const db = drizzle(pool, { schema });
