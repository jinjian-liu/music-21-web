import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { localDB, migrateLocal } from "./local-db";
import { createDemoSong } from "../midi/demo-song";
beforeEach(async () => {
  await localDB.clear();
});
describe("local persistence", () => {
  it("preserves parsed notes, original MIDI bytes and account-specific cloud mapping", async () => {
    const song = createDemoSong();
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/midi" });
    await localDB.put({
      id: song.id,
      song,
      file,
      cloudId: "cloud",
      cloudOwnerId: "owner",
      createdAt: song.createdAt,
      updatedAt: song.createdAt,
    });
    const stored = await localDB.get(song.id);
    expect(stored?.song.tracks).toEqual(song.tracks);
    expect(stored?.cloudOwnerId).toBe("owner");
    expect((await localDB.all()).length).toBe(1);
  });
  it("uses a unique session key and supports deletion", async () => {
    const session = {
      id: crypto.randomUUID(),
      pieceId: "demo",
      title: "demo",
      mode: "practice" as const,
      targetTrackId: null,
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(1000).toISOString(),
      activeMs: 1000,
      matched: null,
      attempted: null,
    };
    await localDB.saveSession(session);
    await localDB.saveSession(session);
    expect(await localDB.sessions()).toHaveLength(1);
    await localDB.clear();
    expect(await localDB.sessions()).toHaveLength(0);
  });
  it("migrates readable v1 scores but does not invent scores from stale recents", async () => {
    const song = createDemoSong();
    localStorage.setItem(
      "xianzhi:midi:recent",
      JSON.stringify([
        { id: song.id, title: song.title },
        { id: "lost", title: "lost" },
      ]),
    );
    sessionStorage.setItem("xianzhi:midi:" + song.id, JSON.stringify(song));
    await migrateLocal();
    expect((await localDB.get(song.id))?.song.title).toBe(song.title);
    expect(await localDB.get("lost")).toBeUndefined();
  });
});
