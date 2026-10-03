import { randomUUID } from "node:crypto";
import { query, transaction } from "./repository";
import { readObject, putJson, deleteObject } from "./storage";
import { parseMidiBuffer } from "../shared/midi/parse-midi";
export async function processNextJob(): Promise<void> {
  const token = randomUUID();
  const job = await transaction(async (tx) => {
    const selected = (
      await tx.query(`SELECT j.* FROM parse_jobs j JOIN pieces p ON p.id=j.piece_id WHERE p.deleted_at IS NULL AND
   ((j.status='queued' AND j.available_at<=now()) OR (j.status='processing' AND j.locked_at<now()-interval '5 minutes'))
   ORDER BY j.available_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`)
    ).rows[0];
    if (!selected) return null;
    if (selected.attempts >= 3) {
      await tx.query(
        "UPDATE parse_jobs SET status='failed',locked_at=NULL,lock_token=NULL WHERE id=$1",
        [selected.id],
      );
      await tx.query(
        "UPDATE pieces SET parse_status='failed',parse_error='解析多次中断，请重试' WHERE id=$1",
        [selected.piece_id],
      );
      return null;
    }
    await tx.query(
      "UPDATE parse_jobs SET status='processing',attempts=attempts+1,locked_at=now(),lock_token=$2 WHERE id=$1",
      [selected.id, token],
    );
    await tx.query("UPDATE pieces SET parse_status='processing' WHERE id=$1", [
      selected.piece_id,
    ]);
    return selected;
  });
  if (!job) return;
  const [piece] = await query(
    "SELECT * FROM pieces WHERE id=$1 AND deleted_at IS NULL",
    [job.piece_id],
  );
  if (!piece) return;
  const key = `scores/${piece.owner_id}/${piece.id}.${token}.json`;
  const heartbeat = setInterval(() => {
    void query(
      "UPDATE parse_jobs SET locked_at=now() WHERE id=$1 AND lock_token=$2 AND status='processing'",
      [job.id, token],
    ).catch(console.error);
  }, 30000);
  try {
    const bytes = await readObject(piece.object_key);
    const song = parseMidiBuffer(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
      piece.original_name,
    );
    song.id = piece.id;
    song.title = piece.title;
    song.status = "private";
    await putJson(key, song);
    const committed = await transaction(async (tx) => {
      const held = await tx.query(
        "SELECT id FROM parse_jobs WHERE id=$1 AND lock_token=$2 AND status='processing' FOR UPDATE",
        [job.id, token],
      );
      if (!held.rowCount) return false;
      const live = await tx.query(
        "SELECT id FROM pieces WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [piece.id],
      );
      if (!live.rowCount) return false;
      await tx.query("DELETE FROM piece_tracks WHERE piece_id=$1", [piece.id]);
      for (const t of song.tracks)
        await tx.query(
          "INSERT INTO piece_tracks(piece_id,track_key,order_index,name,channel,program,instrument,percussion,note_count,range_low,range_high) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            piece.id,
            t.id,
            t.index,
            t.name,
            t.channel,
            t.program,
            t.instrument,
            t.percussion,
            t.noteCount,
            t.range?.[0] ?? null,
            t.range?.[1] ?? null,
          ],
        );
      await tx.query(
        "UPDATE pieces SET parse_status='ready',status=publication_status,score_object_key=$2,duration_seconds=$3,ppq=$4,inferred_key=$5,track_count=$6,parse_error=NULL,updated_at=now() WHERE id=$1",
        [
          piece.id,
          key,
          Math.ceil(song.durationSeconds),
          song.ppq,
          song.inferredKey + " " + song.inferredMode,
          song.tracks.length,
        ],
      );
      await tx.query(
        "UPDATE parse_jobs SET status='complete',locked_at=NULL,lock_token=NULL,last_error=NULL WHERE id=$1",
        [job.id],
      );
      return true;
    });
    if (!committed) await deleteObject(key);
    else if (piece.score_object_key && piece.score_object_key !== key)
      await deleteObject(piece.score_object_key).catch(console.error);
  } catch (error) {
    const message = error instanceof Error ? error.message : "解析失败";
    await deleteObject(key).catch(console.error);
    await transaction(async (tx) => {
      const retry = job.attempts + 1 < 3;
      const held = await tx.query(
        "UPDATE parse_jobs SET status=$3,last_error=$4,locked_at=NULL,lock_token=NULL,available_at=now()+interval '30 seconds' WHERE id=$1 AND lock_token=$2 RETURNING id",
        [job.id, token, retry ? "queued" : "failed", message],
      );
      if (held.rowCount)
        await tx.query(
          "UPDATE pieces SET parse_status=$2,parse_error=$3 WHERE id=$1 AND deleted_at IS NULL",
          [piece.id, retry ? "queued" : "failed", message],
        );
    });
  } finally {
    clearInterval(heartbeat);
  }
}
export async function processCleanup(): Promise<void> {
  await transaction(async (tx) => {
    const job = (
      await tx.query(
        "SELECT c.*,p.object_key,p.score_object_key FROM storage_cleanup c JOIN pieces p ON p.id=c.piece_id WHERE c.available_at<=now() ORDER BY c.available_at FOR UPDATE OF c SKIP LOCKED LIMIT 1",
      )
    ).rows[0];
    if (!job) return;
    try {
      await deleteObject(job.object_key);
      await deleteObject(job.score_object_key);
      await tx.query("DELETE FROM storage_cleanup WHERE id=$1", [job.id]);
    } catch (error) {
      await tx.query(
        "UPDATE storage_cleanup SET attempts=attempts+1,last_error=$2,available_at=now()+interval '5 minutes' WHERE id=$1",
        [job.id, String(error)],
      );
    }
  });
}
