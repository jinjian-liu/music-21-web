// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import MidiPackage from "@tonejs/midi";
vi.mock("./db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const database = new PGlite();
  const execute = async (sql: string, values: unknown[] = []) => {
    const r = await database.query(sql, values);
    return { ...r, rowCount: r.affectedRows || r.rows.length };
  };
  return {
    testDatabase: database,
    pool: {
      query: execute,
      connect: async () => ({ query: execute, release: () => {} }),
      end: async () => database.close(),
    },
    db: {},
  };
});
vi.mock("./storage", () => {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    createUploadUrl: async () => "https://storage.test/upload",
    headObject: async (key: string) => ({
      ContentLength: objects.get(key)?.length,
    }),
    readObject: async (key: string) => {
      const b = objects.get(key);
      if (!b) throw new Error("missing object");
      return b;
    },
    putJson: async (key: string, v: unknown) => {
      objects.set(key, new TextEncoder().encode(JSON.stringify(v)));
    },
    deleteObject: async (key: string) => {
      objects.delete(key);
    },
  };
});
import { buildApp } from "./app";
import { query } from "./repository";
import { processNextJob, processCleanup } from "./parse-worker";
let app: Awaited<ReturnType<typeof buildApp>>,
  cookie = "",
  adminCookie = "",
  pieceId = "",
  slug = "",
  legacyId = "";
async function request(
  method: any,
  url: string,
  payload?: unknown,
  token = cookie,
) {
  return app.inject({
    method,
    url,
    headers: token ? { cookie: token } : {},
    ...(payload === undefined ? {} : { payload: payload as any }),
  });
}
async function register(email: string) {
  const r = await request(
    "POST",
    "/api/auth/register",
    { email, password: "testing-password-123", displayName: "测试用户" },
    "",
  );
  expect(r.statusCode).toBe(201);
  return r.cookies[0].name + "=" + r.cookies[0].value;
}
beforeAll(async () => {
  const db = ((await import("./db")) as any).testDatabase;
  const v1 = (
    await readFile(
      new URL("./migrations/0001_midi_platform.sql", import.meta.url),
      "utf8",
    )
  ).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
  await db.exec(v1);
  const [u] = await query(
    "INSERT INTO users(email,password_hash,display_name) VALUES('legacy@example.com','legacy','旧用户') RETURNING id",
  );
  const [p] = await query(
    "INSERT INTO pieces(owner_id,slug,title,original_name,object_key,size_bytes,status,score_object_key) VALUES($1,'legacy-slug','旧曲目','old.mid','old.mid',100,'published','old.json') RETURNING id",
    [u.id],
  );
  legacyId = p.id;
  await db.exec(
    await readFile(
      new URL("./migrations/0002_platform.sql", import.meta.url),
      "utf8",
    ),
  );
  await query(
    "INSERT INTO practice_sessions(id,user_id,piece_id,title,mode,started_at,ended_at,active_ms,matched,attempted) VALUES(gen_random_uuid(),$1,'legacy','旧练习','single-note',now(),now(),0,1,2)",
    [u.id],
  );
  app = await buildApp();
  await db.exec(
    await readFile(
      new URL("./migrations/0003_step_practice.sql", import.meta.url),
      "utf8",
    ),
  );
  cookie = await register("user@example.com");
  adminCookie = await register("admin@example.com");
  await query("UPDATE users SET role='admin' WHERE email='admin@example.com'");
}, 30000);
afterAll(async () => {
  await app?.close();
  await (await import("./db")).pool.end();
});
describe.sequential("API and PostgreSQL lifecycle", () => {
  it("migrates v1 IDs, links and publication states without data loss", async () => {
    const [p] = await query("SELECT * FROM pieces WHERE id=$1", [legacyId]);
    expect(p.slug).toBe("legacy-slug");
    expect(p.parse_status).toBe("ready");
    expect(p.publication_status).toBe("published");
    expect(
      (
        await query(
          "SELECT mode,matched,attempted FROM practice_sessions WHERE piece_id='legacy'",
        )
      )[0],
    ).toMatchObject({ mode: "single-note", matched: 1, attempted: 2 });
  });
  it("validates auth, names, logout and cross-origin mutations", async () => {
    expect(
      (await request("GET", "/api/auth/me", undefined, "")).statusCode,
    ).toBe(401);
    expect(
      (
        await request(
          "POST",
          "/api/auth/login",
          { email: "user@example.com", password: "incorrect-password" },
          "",
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (await request("PATCH", "/api/account", { displayName: "" })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/logout",
          headers: { origin: "https://untrusted.test", cookie },
        })
      ).statusCode,
    ).toBe(403);
    const temporary = await register("temp@example.com");
    await request("POST", "/api/auth/logout", undefined, temporary);
    expect(
      (await request("GET", "/api/auth/me", undefined, temporary)).statusCode,
    ).toBe(401);
  });
  it("deduplicates uploads, parses scores, and permits cloud reopening", async () => {
    const midi = new MidiPackage.Midi();
    midi.addTrack().addNote({ midi: 60, time: 0, duration: 2 });
    const bytes = midi.toArray(),
      payload = {
        clientId: "local-1",
        fileName: "test.mid",
        size: bytes.length,
        title: "测试曲目",
      };
    const a = await request("POST", "/api/uploads/intents", payload);
    expect(a.statusCode).toBe(201);
    pieceId = a.json().pieceId;
    expect(
      (await request("POST", "/api/uploads/intents", payload)).json().pieceId,
    ).toBe(pieceId);
    const [p] = await query("SELECT * FROM pieces WHERE id=$1", [pieceId]);
    slug = p.slug;
    ((await import("./storage")) as any).objects.set(p.object_key, bytes);
    expect(
      (await request("POST", "/api/pieces/" + pieceId + "/complete"))
        .statusCode,
    ).toBe(202);
    await processNextJob();
    const state = await request("GET", "/api/pieces/" + pieceId + "/status");
    expect(state.json().parseStatus).toBe("ready");
    expect(
      (await request("GET", "/api/pieces/" + pieceId + "/score")).json().tracks,
    ).toHaveLength(1);
    await request("POST", "/api/pieces/" + pieceId + "/complete");
    expect(
      (await request("GET", "/api/pieces/" + pieceId + "/status")).json()
        .parseStatus,
    ).toBe("ready");
    expect(
      (await request("GET", "/api/pieces?page=1&q=测试")).json().total,
    ).toBe(1);
  });
  it("enforces ownership, review states, rejection and resubmission", async () => {
    expect(
      (
        await request(
          "GET",
          "/api/pieces/" + pieceId + "/score",
          undefined,
          adminCookie,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (await request("POST", "/api/admin/pieces/" + pieceId + "/approve", {}))
        .statusCode,
    ).toBe(403);
    expect(
      (await request("POST", "/api/pieces/" + pieceId + "/submit-review"))
        .statusCode,
    ).toBe(409);
    await request("PATCH", "/api/pieces/" + pieceId, {
      rightsConfirmed: true,
      rightsSource: "原创",
    });
    expect(
      (await request("POST", "/api/pieces/" + pieceId + "/submit-review"))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          "POST",
          "/api/admin/pieces/" + pieceId + "/reject",
          { reason: "请补充创作说明" },
          adminCookie,
        )
      ).statusCode,
    ).toBe(200);
    await request("PATCH", "/api/pieces/" + pieceId, {
      rightsSource: "本人原创并拥有全部权利",
    });
    expect(
      (await request("POST", "/api/pieces/" + pieceId + "/submit-review"))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          "POST",
          "/api/admin/pieces/" + pieceId + "/approve",
          {},
          adminCookie,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/api/public/pieces/" + slug, undefined, ""))
        .statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/api/gallery?page=1&q=测试", undefined, "")).json()
        .total,
    ).toBe(1);
    expect(
      (
        await request(
          "POST",
          "/api/admin/pieces/" + pieceId + "/approve",
          {},
          adminCookie,
        )
      ).statusCode,
    ).toBe(409);
  });
  it("requires re-review after editing a published piece and handles reports/removal transactionally", async () => {
    await request("PATCH", "/api/pieces/" + pieceId, { title: "修改后的曲目" });
    expect(
      (await request("GET", "/api/public/pieces/" + slug, undefined, ""))
        .statusCode,
    ).toBe(404);
    await request(
      "POST",
      "/api/admin/pieces/" + pieceId + "/approve",
      {},
      adminCookie,
    );
    const report = await request(
      "POST",
      "/api/public/pieces/" + slug + "/reports",
      {
        email: "report@example.com",
        reason: "incorrect",
        detail: "曲谱节拍需要核查",
      },
      "",
    );
    expect(report.statusCode).toBe(201);
    const reports = (
      await request("GET", "/api/admin/reports?page=1", undefined, adminCookie)
    ).json();
    expect(
      (
        await request(
          "POST",
          "/api/admin/pieces/" + pieceId + "/remove",
          { reason: "曲谱正在核查" },
          adminCookie,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await request(
          "PATCH",
          "/api/admin/reports/" + reports.items[0].id,
          { status: "resolved", reason: "已经下架核查" },
          adminCookie,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/api/public/pieces/" + slug, undefined, ""))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await request("GET", "/api/admin/events?page=1", undefined, adminCookie)
      ).json().total,
    ).toBeGreaterThanOrEqual(5);
  });
  it("saves practice sessions once and rejects impossible timings", async () => {
    const session = {
      id: crypto.randomUUID(),
      pieceId: "local",
      title: "练习",
      mode: "practice",
      targetTrackId: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
      activeMs: 30000,
      matched: null,
      attempted: null,
    };
    expect(
      (
        await request("POST", "/api/practice/sessions/batch", {
          sessions: [session, session],
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await request("GET", "/api/practice/summary")).json().sessions,
    ).toBe(1);
    expect(
      Number((await request("GET", "/api/practice/summary")).json().activeMs),
    ).toBe(30000);
    expect(
      (
        await request("POST", "/api/practice/sessions/batch", {
          sessions: [{ ...session, activeMs: 100000 }],
        })
      ).statusCode,
    ).toBe(400);
  });
  it("accepts step sessions idempotently alongside old modes and rejects step scores", async () => {
    const session = {
      id: crypto.randomUUID(),
      pieceId: "local-step",
      title: "逐音",
      mode: "step",
      targetTrackId: "melody",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
      activeMs: 20000,
      matched: null,
      attempted: null,
    };
    for (let i = 0; i < 2; i++) {
      expect(
        (
          await request("POST", "/api/practice/sessions/batch", {
            sessions: [session, session],
          })
        ).statusCode,
      ).toBe(200);
    }
    const list = (await request("GET", "/api/practice/sessions")).json();
    expect(list.items.filter((s: any) => s.mode === "step")).toHaveLength(1);
    expect(list.items.find((s: any) => s.id === session.id)).toMatchObject({
      mode: "step",
      matched: null,
      attempted: null,
    });
    expect(list.items.some((s: any) => s.mode === "practice")).toBe(true);
    expect(
      (
        await request("POST", "/api/practice/sessions/batch", {
          sessions: [
            { ...session, id: crypto.randomUUID(), matched: 1, attempted: 2 },
          ],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request(
          "POST",
          "/api/practice/sessions/batch",
          { sessions: [session] },
          "",
        )
      ).statusCode,
    ).toBe(401);
  });
  it("recovers expired parse leases and bounds repeated interruption attempts", async () => {
    await query(
      "UPDATE parse_jobs SET status='processing',attempts=1,locked_at=now()-interval '6 minutes' WHERE piece_id=$1",
      [pieceId],
    );
    await processNextJob();
    expect(
      (
        await query("SELECT status FROM parse_jobs WHERE piece_id=$1", [
          pieceId,
        ])
      )[0].status,
    ).toBe("complete");
    await query(
      "UPDATE parse_jobs SET status='processing',attempts=3,locked_at=now()-interval '6 minutes' WHERE piece_id=$1",
      [pieceId],
    );
    await processNextJob();
    expect(
      (await query("SELECT parse_status FROM pieces WHERE id=$1", [pieceId]))[0]
        .parse_status,
    ).toBe("failed");
    expect(
      (await request("POST", "/api/pieces/" + pieceId + "/retry")).statusCode,
    ).toBe(200);
    await processNextJob();
    expect(
      (await query("SELECT parse_status FROM pieces WHERE id=$1", [pieceId]))[0]
        .parse_status,
    ).toBe("ready");
  });
  it("hides deleted pieces immediately and cleans storage asynchronously", async () => {
    expect((await request("DELETE", "/api/pieces/" + pieceId)).statusCode).toBe(
      204,
    );
    expect(
      (await request("GET", "/api/pieces/" + pieceId + "/score")).statusCode,
    ).toBe(404);
    expect(
      await query("SELECT * FROM storage_cleanup WHERE piece_id=$1", [pieceId]),
    ).toHaveLength(1);
    await query(
      "UPDATE storage_cleanup SET available_at=now() WHERE piece_id=$1",
      [pieceId],
    );
    await processCleanup();
    expect(
      await query("SELECT * FROM storage_cleanup WHERE piece_id=$1", [pieceId]),
    ).toHaveLength(0);
  });
});
