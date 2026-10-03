import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { userFor } from "./auth";
import { query, transaction, pieceColumns } from "../repository";
import { DomainError, assertTransition } from "../services/pieces";
import { pagination, idParams } from "../validation";
import { createUploadUrl, headObject, readObject } from "../storage";
const visible =
  "publication_status='published' AND parse_status='ready' AND deleted_at IS NULL AND (rights_expires_at IS NULL OR rights_expires_at>now())";
export async function ownerPiece(id: string, owner: string) {
  const [p] = await query(
    "SELECT * FROM pieces WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL",
    [id, owner],
  );
  if (!p) throw new DomainError("NOT_FOUND", 404);
  return p;
}
export async function scoreFor(p: any) {
  if (p.parse_status !== "ready" || !p.score_object_key)
    throw new DomainError("NOT_READY");
  return {
    ...JSON.parse(
      new TextDecoder().decode(await readObject(p.score_object_key)),
    ),
    id: p.id,
    title: p.title,
    status: p.publication_status,
  };
}
export async function registerPieces(app: FastifyInstance) {
  app.post("/api/uploads/intents", async (req, reply) => {
    const u = await userFor(req);
    const v = z
      .object({
        clientId: z.string().min(1).max(200).optional(),
        fileName: z
          .string()
          .regex(/\.midi?$/i)
          .max(180),
        size: z
          .number()
          .int()
          .positive()
          .max(10 * 1024 * 1024),
        contentType: z.string().max(100).default("audio/midi"),
        title: z.string().trim().min(1).max(160),
      })
      .parse(req.body);
    const p = await transaction(async (tx) => {
      await tx.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [u.id]);
      if (v.clientId) {
        const existing = (
          await tx.query(
            "SELECT * FROM pieces WHERE owner_id=$1 AND client_id=$2",
            [u.id, v.clientId],
          )
        ).rows[0];
        if (existing) {
          if (existing.deleted_at) throw new DomainError("DELETED");
          return existing;
        }
      }
      const n = (
        await tx.query(
          "SELECT count(*)::int AS n FROM pieces WHERE owner_id=$1 AND created_at>now()-interval '24 hours'",
          [u.id],
        )
      ).rows[0].n;
      if (n >= 20) throw new DomainError("UPLOAD_LIMIT", 429);
      const id = randomUUID();
      return (
        await tx.query(
          "INSERT INTO pieces(id,owner_id,slug,title,original_name,object_key,size_bytes,client_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            id,
            u.id,
            randomUUID().replaceAll("-", "").slice(0, 18),
            v.title,
            v.fileName,
            `midi/${u.id}/${id}.mid`,
            v.size,
            v.clientId || null,
          ],
        )
      ).rows[0];
    });
    if (p.size_bytes !== v.size) throw new DomainError("UPLOAD_MISMATCH");
    return reply
      .code(201)
      .send({
        pieceId: p.id,
        parseStatus: p.parse_status,
        uploadUrl:
          p.parse_status === "uploading"
            ? await createUploadUrl(p.object_key, "audio/midi", p.size_bytes)
            : null,
        expiresIn: 600,
      });
  });
  app.post("/api/pieces/:id/complete", async (req, reply) => {
    const u = await userFor(req),
      { id } = idParams.parse(req.params);
    const p = await ownerPiece(id, u.id);
    if (p.parse_status !== "uploading")
      return { pieceId: id, parseStatus: p.parse_status };
    const obj = await headObject(p.object_key);
    if (obj.ContentLength !== p.size_bytes)
      throw new DomainError("INVALID_UPLOAD_SIZE", 400);
    await transaction(async (tx) => {
      const updated = await tx.query(
        "UPDATE pieces SET parse_status='queued',status='parsing',updated_at=now() WHERE id=$1 AND parse_status='uploading' AND deleted_at IS NULL RETURNING id",
        [id],
      );
      if (updated.rowCount)
        await tx.query(
          "INSERT INTO parse_jobs(piece_id) VALUES($1) ON CONFLICT(piece_id) DO NOTHING",
          [id],
        );
    });
    return reply
      .code(202)
      .send({ pieceId: id, parseStatus: "queued", status: "parsing" });
  });
  app.get("/api/pieces", async (req) => {
    const u = await userFor(req),
      p = pagination.parse(req.query);
    const args = [u.id, "%" + p.q + "%"];
    const where =
      "owner_id=$1 AND deleted_at IS NULL AND (title ILIKE $2 OR COALESCE(author,'') ILIKE $2)";
    const items = await query(
      `SELECT ${pieceColumns} FROM pieces WHERE ${where} ORDER BY ${p.sort === "title" ? "title ASC,id" : "created_at DESC,id"} LIMIT $3 OFFSET $4`,
      [...args, p.pageSize, (p.page - 1) * p.pageSize],
    );
    const [n] = await query(
      `SELECT count(*)::int AS total FROM pieces WHERE ${where}`,
      args,
    );
    return { items, total: n.total, page: p.page, pageSize: p.pageSize };
  });
  app.get("/api/pieces/:id/status", async (req) => {
    const u = await userFor(req),
      { id } = idParams.parse(req.params);
    await ownerPiece(id, u.id);
    return (
      await query(`SELECT ${pieceColumns},status FROM pieces WHERE id=$1`, [id])
    )[0];
  });
  app.get("/api/pieces/:id/score", async (req) => {
    const u = await userFor(req),
      { id } = idParams.parse(req.params);
    return scoreFor(await ownerPiece(id, u.id));
  });
  app.post("/api/pieces/:id/retry", async (req) => {
    const u = await userFor(req),
      { id } = idParams.parse(req.params);
    await transaction(async (tx) => {
      const result = await tx.query(
        "UPDATE pieces SET parse_status='queued',parse_error=NULL WHERE id=$1 AND owner_id=$2 AND parse_status='failed' AND deleted_at IS NULL RETURNING id",
        [id, u.id],
      );
      if (!result.rowCount) throw new DomainError("INVALID_STATE");
      await tx.query(
        "INSERT INTO parse_jobs(piece_id) VALUES($1) ON CONFLICT(piece_id) DO UPDATE SET status='queued',attempts=0,last_error=NULL,locked_at=NULL,lock_token=NULL,available_at=now()",
        [id],
      );
    });
    return { parseStatus: "queued" };
  });
  app.patch("/api/pieces/:id", async (req) => {
    const u = await userFor(req),
      { id } = idParams.parse(req.params);
    const v = z
      .object({
        title: z.string().trim().min(1).max(160).optional(),
        author: z.string().trim().max(120).optional(),
        rightsSource: z.string().trim().max(500).optional(),
        rightsConfirmed: z.boolean().optional(),
        rightsExpiresAt: z.string().datetime().nullable().optional(),
      })
      .parse(req.body);
    return transaction(async (tx) => {
      const p = (
        await tx.query(
          "SELECT * FROM pieces WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE",
          [id, u.id],
        )
      ).rows[0];
      if (!p) throw new DomainError("NOT_FOUND", 404);
      if (["pending_review", "removed"].includes(p.publication_status))
        throw new DomainError("INVALID_STATE");
      const status =
        p.publication_status === "published"
          ? "pending_review"
          : p.publication_status;
      const row = (
        await tx.query(
          `UPDATE pieces SET title=$2,author=$3,rights_source=$4,rights_confirmed=$5,rights_expires_at=$6,publication_status=$7,status=CASE WHEN parse_status='ready' THEN $7 ELSE status END,updated_at=now() WHERE id=$1 RETURNING ${pieceColumns}`,
          [
            id,
            v.title ?? p.title,
            v.author ?? p.author,
            v.rightsSource ?? p.rights_source,
            v.rightsConfirmed ?? p.rights_confirmed,
            v.rightsExpiresAt === undefined
              ? p.rights_expires_at
              : v.rightsExpiresAt,
            status,
          ],
        )
      ).rows[0];
      return row;
    });
  });
  app.post("/api/pieces/:id/submit-review", async (req) => {
    const u = await userFor(req),
      { id } = idParams.parse(req.params);
    await transaction(async (tx) => {
      const p = (
        await tx.query(
          "SELECT * FROM pieces WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE",
          [id, u.id],
        )
      ).rows[0];
      if (!p) throw new DomainError("NOT_FOUND", 404);
      assertTransition("submit", p);
      await tx.query(
        "UPDATE pieces SET publication_status='pending_review',status='pending_review',review_reason=NULL,updated_at=now() WHERE id=$1",
        [id],
      );
    });
    return { status: "pending_review" };
  });
  app.delete("/api/pieces/:id", async (req, reply) => {
    const u = await userFor(req),
      { id } = idParams.parse(req.params);
    await transaction(async (tx) => {
      const p = await tx.query(
        "UPDATE pieces SET deleted_at=now(),publication_status='removed',status='removed',client_id=NULL WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL RETURNING id",
        [id, u.id],
      );
      if (!p.rowCount) throw new DomainError("NOT_FOUND", 404);
      await tx.query(
        "UPDATE parse_jobs SET status='failed',lock_token=NULL,locked_at=NULL WHERE piece_id=$1",
        [id],
      );
      await tx.query(
        "INSERT INTO storage_cleanup(piece_id,available_at) VALUES($1,now()+interval '11 minutes') ON CONFLICT DO NOTHING",
        [id],
      );
    });
    return reply.code(204).send();
  });
  app.get("/api/gallery", async (req) => {
    const p = pagination.parse(req.query),
      where = visible + " AND (title ILIKE $1 OR COALESCE(author,'') ILIKE $1)";
    const items = await query(
      `SELECT ${pieceColumns}, play_count AS "playCount" FROM pieces WHERE ${where} ORDER BY ${p.sort === "popular" ? "play_count DESC,created_at DESC" : "created_at DESC"},id LIMIT $2 OFFSET $3`,
      ["%" + p.q + "%", p.pageSize, (p.page - 1) * p.pageSize],
    );
    const [n] = await query(
      `SELECT count(*)::int AS total FROM pieces WHERE ${where}`,
      ["%" + p.q + "%"],
    );
    // Keep the original array response for clients that do not opt into pagination.
    if (!("page" in (req.query as object))) return items;
    return { items, total: n.total, page: p.page, pageSize: p.pageSize };
  });
  app.get("/api/public/pieces/:slug", async (req) => {
    const { slug } = z
      .object({ slug: z.string().min(8).max(40) })
      .parse(req.params);
    const [p] = await query(
      `SELECT * FROM pieces WHERE slug=$1 AND ${visible}`,
      [slug],
    );
    if (!p) throw new DomainError("NOT_FOUND", 404);
    return {
      piece: {
        slug: p.slug,
        title: p.title,
        author: p.author,
        status: p.publication_status,
      },
      score: await scoreFor(p),
    };
  });
  app.post("/api/public/pieces/:slug/play", async (req) => {
    const { slug } = z
      .object({ slug: z.string().min(8).max(40) })
      .parse(req.params);
    const result = await query(
      `UPDATE pieces SET play_count=play_count+1 WHERE slug=$1 AND ${visible} RETURNING id`,
      [slug],
    );
    if (!result.length) throw new DomainError("NOT_FOUND", 404);
    return { ok: true };
  });
  app.post("/api/public/pieces/:slug/reports", async (req, reply) => {
    const { slug } = z
      .object({ slug: z.string().min(8).max(40) })
      .parse(req.params);
    const v = z
      .object({
        email: z.string().email().max(254),
        reason: z.enum(["copyright", "abuse", "incorrect", "other"]),
        detail: z.string().trim().min(3).max(2000),
      })
      .parse(req.body);
    const [p] = await query(
      `SELECT id FROM pieces WHERE slug=$1 AND ${visible}`,
      [slug],
    );
    if (!p) throw new DomainError("NOT_FOUND", 404);
    await query(
      "INSERT INTO reports(piece_id,reporter_email,reason,detail) VALUES($1,$2,$3,$4)",
      [p.id, v.email, v.reason, v.detail],
    );
    return reply.code(201).send({ ok: true });
  });
}
