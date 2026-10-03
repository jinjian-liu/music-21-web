import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { query } from "./repository";
import type { Account } from "../shared/contracts";
export const SESSION_COOKIE = "music21_session";
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function createSession(userId: string, reply: FastifyReply) {
  const token = randomBytes(32).toString("base64url"),
    expiresAt = new Date(Date.now() + 30 * 86400000);
  await query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)",
    [userId, hashToken(token), expiresAt],
  );
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
  });
}
export async function getRequestUser(
  request: FastifyRequest,
): Promise<Account | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  return (
    (
      await query<Account>(
        'SELECT u.id,u.email,u.display_name AS "displayName",u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1',
        [hashToken(token)],
      )
    )[0] || null
  );
}
export async function revokeSession(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const token = request.cookies[SESSION_COOKIE];
  if (token)
    await query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}
