import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseMidiFile } from "../midi/parse-midi";
import { localDB } from "../lib/local-db";
import { errorText } from "../lib/api";
import { Icon, Modal, Notice } from "./ui";
export function ImportButton({ large = false }: { large?: boolean }) {
  const input = useRef<HTMLInputElement>(null),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  async function importFile(file: File) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const song = await parseMidiFile(file);
      await localDB.put({
        id: song.id,
        song,
        file,
        createdAt: song.createdAt,
        updatedAt: new Date().toISOString(),
      });
      setOpen(false);
      navigate("/midi/" + song.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <button className="primary" onClick={() => setOpen(true)}>
        <Icon name="upload" />
        {large ? "导入一首 MIDI" : "导入曲目"}
      </button>
      {open && (
        <Modal
          title="把喜欢的音乐，变成下一次练习"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p className="muted">
            文件仅保存于当前浏览器。你可以随时选择保存到私人云端曲库。
          </p>
          <button
            className="dropzone"
            disabled={busy}
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0])
                void importFile(e.dataTransfer.files[0]);
            }}
          >
            <Icon name="upload" size={32} />
            <strong>
              {busy ? "正在解析并保存…" : "点击选择，或将文件拖到这里"}
            </strong>
            <span>.mid / .midi · 最大 10 MB</span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".mid,.midi"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) void importFile(e.target.files[0]);
            }}
          />
          <Notice>{error}</Notice>
        </Modal>
      )}
    </>
  );
}
