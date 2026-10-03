import type { ParsedSong } from "../../shared/midi/types";
import type { PracticeSession } from "../../shared/contracts";
export interface LocalPiece {
  id: string;
  song: ParsedSong;
  file?: Blob;
  cloudId?: string;
  cloudOwnerId?: string;
  createdAt: string;
  updatedAt: string;
  missing?: boolean;
}
let opened: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  if (!opened)
    opened = new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("xianzhi-platform", 1);
      r.onupgradeneeded = () => {
        for (const name of ["pieces", "sessions", "settings"])
          r.result.createObjectStore(name, { keyPath: "id" });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("请关闭其他旧版本页面后重试"));
    }).catch((e) => {
      opened = undefined;
      throw e;
    });
  return opened;
}
async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    let result: T;
    request.onsuccess = () => {
      result = request.result;
    };
    tx.oncomplete = () => {
      if (mode === "readwrite") window.dispatchEvent(new Event("xianzhi-data"));
      resolve(result);
    };
    tx.onerror = () => reject(tx.error || request.error);
    tx.onabort = () => reject(tx.error || new Error("本机保存失败"));
  });
}
export const localDB = {
  all: () => run<LocalPiece[]>("pieces", "readonly", (s) => s.getAll()),
  get: (id: string) =>
    run<LocalPiece | undefined>("pieces", "readonly", (s) => s.get(id)),
  put: (p: LocalPiece) =>
    run<IDBValidKey>("pieces", "readwrite", (s) => s.put(p)),
  remove: async (id: string) => {
    await run<void>("pieces", "readwrite", (s) => s.delete(id));
    sessionStorage.removeItem("xianzhi:midi:" + id);
    try {
      const recent = JSON.parse(
        localStorage.getItem("xianzhi:midi:recent") || "[]",
      ) as { id: string }[];
      localStorage.setItem(
        "xianzhi:midi:recent",
        JSON.stringify(recent.filter((p) => p.id !== id)),
      );
    } catch {
      /* Corrupt legacy recents do not block deletion. */
    }
    const last = await localDB.setting<{ route: string } | null>(
      "last-workspace",
      null,
    );
    if (last?.route === "/midi/" + id)
      await localDB.setSetting("last-workspace", null);
  },
  sessions: () =>
    run<PracticeSession[]>("sessions", "readonly", (s) => s.getAll()),
  saveSession: (s: PracticeSession) =>
    run<IDBValidKey>("sessions", "readwrite", (o) => o.put(s)),
  setting: async <T>(id: string, fallback: T) =>
    (
      await run<{ value: T } | undefined>("settings", "readonly", (s) =>
        s.get(id),
      )
    )?.value ?? fallback,
  setSetting: (id: string, value: unknown) =>
    run<IDBValidKey>("settings", "readwrite", (s) => s.put({ id, value })),
  clear: async () => {
    for (const name of ["pieces", "sessions", "settings"])
      await run(name, "readwrite", (s) => s.clear());
    sessionStorage.removeItem("xianzhi:midi:recent");
    localStorage.removeItem("xianzhi:midi:recent");
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("xianzhi:midi:")) sessionStorage.removeItem(key);
  },
};
let migration: Promise<void> | undefined;
export function migrateLocal(): Promise<void> {
  return (migration ??= (async () => {
    const recents: Array<{
      id: string;
      title: string;
      durationSeconds: number;
      createdAt: string;
    }> = JSON.parse(localStorage.getItem("xianzhi:midi:recent") || "[]");
    const ids = new Set([
      ...recents.map((r) => r.id),
      ...Object.keys(sessionStorage)
        .filter(
          (k) => k.startsWith("xianzhi:midi:") && k !== "xianzhi:midi:recent",
        )
        .map((k) => k.slice("xianzhi:midi:".length)),
    ]);
    for (const id of ids) {
      if (await localDB.get(id)) continue;
      const raw = sessionStorage.getItem("xianzhi:midi:" + id);
      if (raw) {
        try {
          const song = JSON.parse(raw) as ParsedSong;
          if (song.schemaVersion === 1 && Array.isArray(song.tracks))
            await localDB.put({
              id,
              song,
              createdAt: song.createdAt,
              updatedAt: new Date().toISOString(),
              ...(song.status !== "local" ? { cloudId: id } : {}),
            });
        } catch {
          /* Unreadable legacy entry remains available for reimport. */
        }
      }
    }
  })().catch(() => {
    migration = undefined;
  }));
}
