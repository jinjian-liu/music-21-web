import { pool } from "./db";
import type { PoolClient, QueryResultRow } from "pg";
export async function query<T extends QueryResultRow = any>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  return (await pool.query<T>(sql, values)).rows;
}
export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export const pieceColumns = `id, slug, title, author, original_name AS "originalName", parse_status AS "parseStatus",
 publication_status AS "publicationStatus", duration_seconds AS "durationSeconds", track_count AS "trackCount",
 inferred_key AS "inferredKey", created_at AS "createdAt", parse_error AS "parseError", rights_source AS "rightsSource",
 rights_confirmed AS "rightsConfirmed", review_reason AS "reviewReason"`;
