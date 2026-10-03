import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { userFor } from "./auth";
import { query, pieceColumns, transaction } from "../repository";
import { moderate, DomainError } from "../services/pieces";
import { scoreFor } from "./pieces";
import { idParams, pagination } from "../validation";
export async function registerModeration(app: FastifyInstance) {
  app.get("/api/admin/reviews", async (req) => {
    await userFor(req, true);
    const p = pagination.parse(req.query);
    const items = await query(
      `SELECT ${pieceColumns} FROM pieces WHERE publication_status='pending_review' AND deleted_at IS NULL ORDER BY created_at,id LIMIT $1 OFFSET $2`,
      [p.pageSize, (p.page - 1) * p.pageSize],
    );
    const [n] = await query(
      "SELECT count(*)::int AS total FROM pieces WHERE publication_status='pending_review' AND deleted_at IS NULL",
    );
    return "page" in (req.query as object)
      ? { items, total: n.total, page: p.page, pageSize: p.pageSize }
      : items;
  });
  app.get("/api/admin/pieces/:id/score", async (req) => {
    await userFor(req, true);
    const { id } = idParams.parse(req.params);
    const [p] = await query(
      "SELECT * FROM pieces WHERE id=$1 AND deleted_at IS NULL",
      [id],
    );
    if (!p) throw new DomainError("NOT_FOUND", 404);
    return scoreFor(p);
  });
  app.post("/api/admin/pieces/:id/:action", async (req) => {
    const u = await userFor(req, true),
      { id, action } = z
        .object({
          id: z.string().uuid(),
          action: z.enum(["approve", "reject", "remove"]),
        })
        .parse(req.params);
    const { reason } = z
      .object({ reason: z.string().trim().max(1000).optional() })
      .parse(req.body || {});
    if (action !== "approve" && (!reason || reason.length < 3))
      throw new DomainError("REASON_REQUIRED", 400);
    return moderate(id, u.id, action, reason);
  });
  app.get("/api/admin/reports", async (req) => {
    await userFor(req, true);
    const p = pagination.parse(req.query);
    const items = await query(
      'SELECT r.id,r.piece_id AS "pieceId",r.reason,r.detail,r.status,p.title,p.publication_status AS "publicationStatus" FROM reports r JOIN pieces p ON p.id=r.piece_id ORDER BY r.created_at DESC LIMIT $1 OFFSET $2',
      [p.pageSize, (p.page - 1) * p.pageSize],
    );
    const [n] = await query("SELECT count(*)::int AS total FROM reports");
    return { items, total: n.total, page: p.page, pageSize: p.pageSize };
  });
  app.patch("/api/admin/reports/:id", async (req) => {
    const u = await userFor(req, true),
      { id } = idParams.parse(req.params);
    const v = z
      .object({
        status: z.enum(["resolved", "dismissed"]),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);
    await transaction(async (tx) => {
      const r = (
        await tx.query(
          "UPDATE reports SET status=$2 WHERE id=$1 AND status='open' RETURNING piece_id",
          [id, v.status],
        )
      ).rows[0];
      if (!r) throw new DomainError("INVALID_STATE");
      await tx.query(
        "INSERT INTO moderation_events(piece_id,reviewer_id,action,reason,metadata) VALUES($1,$2,$3,$4,$5)",
        [
          r.piece_id,
          u.id,
          "report_" + v.status,
          v.reason,
          JSON.stringify({ reportId: id }),
        ],
      );
    });
    return { ok: true };
  });
  app.get("/api/admin/events", async (req) => {
    await userFor(req, true);
    const p = pagination.parse(req.query);
    const items = await query(
      'SELECT e.id,e.action,e.reason,e.created_at AS "createdAt",p.title FROM moderation_events e JOIN pieces p ON p.id=e.piece_id ORDER BY e.created_at DESC LIMIT $1 OFFSET $2',
      [p.pageSize, (p.page - 1) * p.pageSize],
    );
    const [n] = await query(
      "SELECT count(*)::int AS total FROM moderation_events",
    );
    return { items, total: n.total, page: p.page, pageSize: p.pageSize };
  });
}
