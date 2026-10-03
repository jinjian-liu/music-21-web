import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { hash, verify } from "@node-rs/argon2";
import { createSession, getRequestUser, revokeSession } from "../auth";
import { query } from "../repository";
import { DomainError } from "../services/pieces";
import { audioSchema } from "../validation";
export async function userFor(req: FastifyRequest, admin = false) {
  const user = await getRequestUser(req);
  if (!user) throw new DomainError("AUTH_REQUIRED", 401);
  if (admin && user.role !== "admin")
    throw new DomainError("ADMIN_REQUIRED", 403);
  return user;
}
export async function registerAuth(app: FastifyInstance) {
  const credentials = z.object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(10).max(128),
  });
  app.post("/api/auth/register", async (req, reply) => {
    const v = credentials
      .extend({ displayName: z.string().trim().min(2).max(60) })
      .parse(req.body);
    const [user] = await query(
      'INSERT INTO users(email,password_hash,display_name) VALUES($1,$2,$3) RETURNING id,email,display_name AS "displayName",role',
      [v.email, await hash(v.password), v.displayName],
    );
    await createSession(user.id, reply);
    return reply.code(201).send(user);
  });
  app.post("/api/auth/login", async (req, reply) => {
    const v = credentials.parse(req.body);
    const [u] = await query("SELECT * FROM users WHERE email=$1", [v.email]);
    if (!u || !(await verify(u.password_hash, v.password)))
      throw new DomainError("INVALID_CREDENTIALS", 401);
    await createSession(u.id, reply);
    return {
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      role: u.role,
    };
  });
  app.get("/api/auth/me", async (req) => userFor(req));
  app.post("/api/auth/logout", async (req, reply) => {
    await revokeSession(req, reply);
    return { ok: true };
  });
  app.patch("/api/account", async (req) => {
    const u = await userFor(req);
    const v = z
      .object({ displayName: z.string().trim().min(2).max(60) })
      .parse(req.body);
    return (
      await query(
        'UPDATE users SET display_name=$2 WHERE id=$1 RETURNING id,email,display_name AS "displayName",role',
        [u.id, v.displayName],
      )
    )[0];
  });
  app.get("/api/account/settings", async (req) => {
    const u = await userFor(req);
    return (
      (
        await query("SELECT audio FROM user_settings WHERE user_id=$1", [u.id])
      )[0] || { audio: { volume: 72, resonance: 34, tone: "grand" } }
    );
  });
  app.put("/api/account/settings", async (req) => {
    const u = await userFor(req);
    const { audio } = z.object({ audio: audioSchema }).parse(req.body);
    await query(
      "INSERT INTO user_settings(user_id,audio) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET audio=EXCLUDED.audio",
      [u.id, JSON.stringify(audio)],
    );
    return { audio };
  });
}
