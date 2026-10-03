import { api, json, ApiError } from "./api";
import { localDB, type LocalPiece } from "./local-db";
import type { Account, ParseStatus } from "../../shared/contracts";
const saving = new Map<string, Promise<string>>();
export function saveToCloud(piece: LocalPiece): Promise<string> {
  const existing = saving.get(piece.id);
  if (existing) return existing;
  const task = (async () => {
    const user = await api<Account>("/api/auth/me");
    if (
      piece.cloudId &&
      (!piece.cloudOwnerId || piece.cloudOwnerId === user.id)
    ) {
      try {
        const state = await api<{ parseStatus: ParseStatus }>(
          "/api/pieces/" + piece.cloudId + "/status",
        );
        if (state.parseStatus === "failed")
          await api("/api/pieces/" + piece.cloudId + "/retry", {
            method: "POST",
          });
        if (state.parseStatus !== "uploading") {
          await localDB.put({ ...piece, cloudOwnerId: user.id });
          return piece.cloudId;
        }
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
    }
    if (!piece.file)
      throw new Error("旧曲目没有保留原始 MIDI，请重新导入文件后保存到云端");
    const intent = await api<{
      pieceId: string;
      uploadUrl: string | null;
      parseStatus: ParseStatus;
    }>("/api/uploads/intents", {
      method: "POST",
      body: json({
        clientId: piece.id,
        fileName: piece.song.fileName,
        size: piece.file.size,
        contentType: "audio/midi",
        title: piece.song.title,
      }),
    });
    const next = { ...piece, cloudId: intent.pieceId, cloudOwnerId: user.id };
    await localDB.put(next);
    if (intent.uploadUrl) {
      const upload = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/midi" },
        body: piece.file,
      });
      if (!upload.ok)
        throw new Error("上传失败，本机曲目已保留，可再次保存重试");
      await api("/api/pieces/" + intent.pieceId + "/complete", {
        method: "POST",
      });
    } else if (intent.parseStatus === "failed")
      await api("/api/pieces/" + intent.pieceId + "/retry", { method: "POST" });
    return intent.pieceId;
  })().finally(() => saving.delete(piece.id));
  saving.set(piece.id, task);
  return task;
}
