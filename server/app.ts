import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { DomainError } from "./services/pieces";
import { registerAuth } from "./routes/auth";
import { registerPieces } from "./routes/pieces";
import { registerPractice } from "./routes/practice";
import { registerModeration } from "./routes/moderation";
import { query } from "./repository";

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 1024 * 1024,
    trustProxy:
      process.env.TRUST_PROXY === "true"
        ? (_address: string, hop: number) => hop === 0
        : false,
  });
  await app.register(cookie);
  const origin = process.env.WEB_ORIGIN || "http://127.0.0.1:5173";
  await app.register(cors, { origin, credentials: true });
  const rates = new Map<string, { count: number; until: number }>();
  app.addHook("onRequest", async (req, reply) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== origin
    )
      return reply.code(403).send({ error: "ORIGIN_DENIED" });
    const sensitive =
      req.url.startsWith("/api/auth/login") ||
      req.url.startsWith("/api/auth/register") ||
      req.url.endsWith("/reports");
    const key = req.ip + (sensitive ? ":sensitive" : ":all");
    const now = Date.now();
    let rate = rates.get(key);
    if (!rate || rate.until < now) {
      rate = { count: 0, until: now + 60000 };
      rates.set(key, rate);
    }
    if (++rate.count > (sensitive ? 20 : 240))
      return reply
        .code(429)
        .header("Retry-After", "60")
        .send({ error: "RATE_LIMIT" });
    if (rates.size > 10000)
      for (const [k, v] of rates) if (v.until < now) rates.delete(k);
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ error: "VALIDATION_ERROR", details: error.flatten() });
    if (error instanceof DomainError)
      return reply.code(error.status).send({ error: error.code });
    const code = (error as { code?: string }).code;
    if (code === "23505") return reply.code(409).send({ error: "CONFLICT" });
    if ((error as { statusCode?: number }).statusCode === 400)
      return reply.code(400).send({ error: "INVALID_REQUEST" });
    req.log.error(error);
    return reply.code(503).send({ error: "SERVICE_UNAVAILABLE" });
  });
  app.get("/api/health", async () => ({ ok: true, service: "music-21-api" }));
  app.get("/api/ready", async () => {
    await query("SELECT 1");
    return { ok: true };
  });
  await registerAuth(app);
  await registerPieces(app);
  await registerPractice(app);
  await registerModeration(app);
  return app;
}
