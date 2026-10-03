import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { userFor } from "./auth";
import { query, transaction } from "../repository";
import { pagination, sessionSchema } from "../validation";
export async function registerPractice(app: FastifyInstance) {
  app.post("/api/practice/sessions/batch", async (req) => {
    const u = await userFor(req);
    const { sessions } = z
      .object({ sessions: z.array(sessionSchema).max(100) })
      .parse(req.body);
    await transaction(async (tx) => {
      for (const s of sessions)
        await tx.query(
          "INSERT INTO practice_sessions(id,user_id,piece_id,title,mode,target_track_id,started_at,ended_at,active_ms,matched,attempted) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(user_id,id) DO NOTHING",
          [
            s.id,
            u.id,
            s.pieceId,
            s.title,
            s.mode,
            s.targetTrackId,
            s.startedAt,
            s.endedAt,
            s.activeMs,
            s.matched,
            s.attempted,
          ],
        );
    });
    return { saved: sessions.map((s) => s.id) };
  });
  app.get("/api/practice/sessions", async (req) => {
    const u = await userFor(req);
    const p = pagination.parse(req.query);
    const items = await query(
      'SELECT id,piece_id AS "pieceId",title,mode,target_track_id AS "targetTrackId",started_at AS "startedAt",ended_at AS "endedAt",active_ms AS "activeMs",matched,attempted FROM practice_sessions WHERE user_id=$1 ORDER BY started_at DESC LIMIT $2 OFFSET $3',
      [u.id, p.pageSize, (p.page - 1) * p.pageSize],
    );
    const [n] = await query(
      "SELECT count(*)::int AS total FROM practice_sessions WHERE user_id=$1",
      [u.id],
    );
    return { items, total: n.total, page: p.page, pageSize: p.pageSize };
  });
  app.get("/api/practice/summary", async (req) => {
    const u = await userFor(req);
    return (
      await query(
        'SELECT count(*)::int AS sessions,COALESCE(sum(active_ms),0)::bigint AS "activeMs" FROM practice_sessions WHERE user_id=$1',
        [u.id],
      )
    )[0];
  });
}
