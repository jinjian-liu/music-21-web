import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Page, PieceSummary } from "../../shared/contracts";
import { parseLabels, publicationLabels } from "../../shared/contracts";
import { useLocal } from "../lib/use-local";
import { useAccount } from "../features/account/context";
import { localDB, type LocalPiece } from "../lib/local-db";
import { api, json, errorText } from "../lib/api";
import { saveToCloud } from "../lib/cloud";
import {
  PageHeading,
  Notice,
  Empty,
  Modal,
  Pager,
  Icon,
  duration,
} from "../components/ui";
import { ImportButton } from "../components/ImportButton";
export function LibraryPage() {
  const { pieces, error } = useLocal(),
    { user } = useAccount();
  const [tab, setTab] = useState("local"),
    [q, setQ] = useState(""),
    [sort, setSort] = useState("latest"),
    [page, setPage] = useState(1),
    [cloud, setCloud] = useState<Page<PieceSummary> | null>(null);
  const [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [edit, setEdit] = useState<{
      id: string;
      title: string;
      kind: "rename" | "delete";
      local?: LocalPiece;
    } | null>(null),
    [title, setTitle] = useState("");
  useEffect(() => {
    if (tab !== "cloud" || !user) return;
    let alive = true;
    async function load() {
      setLoading(true);
      try {
        const data = await api<Page<PieceSummary>>(
          "/api/pieces?" + new URLSearchParams({ q, sort, page: String(page) }),
        );
        if (alive) setCloud(data);
      } catch (e) {
        if (alive) {
          setCloud(null);
          setMessage(errorText(e));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [tab, user, q, sort, page, revision]);
  async function act(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      setMessage(success);
      setEdit(null);
      setRevision((r) => r + 1);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function applyEdit() {
    if (!edit) return;
    await act(
      async () => {
        if (edit.local) {
          if (edit.kind === "delete") await localDB.remove(edit.id);
          else
            await localDB.put({
              ...edit.local,
              song: { ...edit.local.song, title: title.trim() },
              updatedAt: new Date().toISOString(),
            });
        } else if (edit.kind === "delete")
          await api("/api/pieces/" + edit.id, { method: "DELETE" });
        else
          await api("/api/pieces/" + edit.id, {
            method: "PATCH",
            body: json({ title: title.trim() }),
          });
      },
      edit.kind === "delete"
        ? "曲目已删除"
        : "曲名已更新；已公开曲目的修改将重新审核",
    );
  }
  const filtered = pieces
    .filter((p) => p.song.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) =>
      sort === "title"
        ? a.song.title.localeCompare(b.song.title)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const legacy = (() => {
    try {
      return (
        JSON.parse(localStorage.getItem("xianzhi:midi:recent") || "[]") as {
          id: string;
          title: string;
        }[]
      ).filter((r) => !pieces.some((p) => p.id === r.id));
    } catch {
      return [];
    }
  })();
  return (
    <>
      <PageHeading
        eyebrow="YOUR MUSIC LIBRARY"
        title="我的曲库"
        description="喜欢的曲子放在这里，下一次练习就近了一步。"
        action={<ImportButton />}
      />
      <div className="toolbar">
        <div className="segmented">
          <button
            className={tab === "local" ? "active" : ""}
            onClick={() => {
              setTab("local");
              setMessage("");
              setPage(1);
            }}
          >
            本机曲目 <small>{pieces.length}</small>
          </button>
          <button
            className={tab === "cloud" ? "active" : ""}
            onClick={() => {
              setTab("cloud");
              setMessage("");
              setPage(1);
            }}
          >
            私人云端
          </button>
        </div>
        <input
          aria-label="搜索我的曲库"
          placeholder="搜索曲名…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="曲库排序"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="latest">最近添加</option>
          <option value="title">曲名顺序</option>
        </select>
      </div>
      <Notice>{message || error}</Notice>
      {tab === "local" ? (
        <>
          <p className="caption">
            本机文件不会自动上传。清除浏览器数据会移除本机曲目，请妥善保留原始文件。
          </p>
          <div className="library-list">
            {filtered.map((p) => (
              <article className="library-row" key={p.id}>
                <span className="song-symbol">
                  <Icon name="music" />
                </span>
                <div className="row-main">
                  <Link to={"/midi/" + p.id}>
                    <h3>{p.song.title}</h3>
                  </Link>
                  <p>
                    {p.song.tracks.length} 条音轨 ·{" "}
                    {duration(p.song.durationSeconds)} ·{" "}
                    {p.cloudId ? "已关联云端" : "仅本机"}
                  </p>
                </div>
                <div className="row-actions">
                  <Link className="button primary" to={"/midi/" + p.id}>
                    练习
                  </Link>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => saveToCloud(p),
                        "已保存至私人云端，可在云端曲库查看解析进度",
                      )
                    }
                  >
                    保存到云端
                  </button>
                  <button
                    onClick={() => {
                      setTitle(p.song.title);
                      setEdit({
                        id: p.id,
                        title: p.song.title,
                        kind: "rename",
                        local: p,
                      });
                    }}
                  >
                    重命名
                  </button>
                  <button
                    className="text-danger"
                    onClick={() =>
                      setEdit({
                        id: p.id,
                        title: p.song.title,
                        kind: "delete",
                        local: p,
                      })
                    }
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <Empty title={q ? "没有找到匹配曲目" : "曲库还很安静"}>
              <p>导入 MIDI，或者先试一首示例曲目。</p>
              <Link to="/midi/demo" className="button">
                打开小星星
              </Link>
            </Empty>
          )}
          {legacy.length > 0 && (
            <Notice>
              发现旧版记录：{legacy.map((r) => r.title).join("、")}
              。原文件已不在浏览器中，请重新导入。
            </Notice>
          )}
        </>
      ) : !user ? (
        <Empty title="登录后访问私人云端">
          <p>本机曲目仍可正常使用。</p>
          <Link className="button primary" to="/settings">
            前往登录
          </Link>
        </Empty>
      ) : (
        <>
          {loading && !cloud && <p className="muted">正在读取云端曲库…</p>}
          <div className="library-list">
            {cloud?.items.map((p) => (
              <article className="library-row" key={p.id}>
                <span className="song-symbol">
                  <Icon name="music" />
                </span>
                <div className="row-main">
                  <h3>{p.title}</h3>
                  <p>
                    {parseLabels[p.parseStatus]} ·{" "}
                    {publicationLabels[p.publicationStatus]} ·{" "}
                    {p.trackCount || 0} 条音轨
                  </p>
                  {(p.parseError || p.reviewReason) && (
                    <p className="text-danger">
                      {p.parseError || p.reviewReason}
                    </p>
                  )}
                </div>
                <div className="row-actions">
                  {p.parseStatus === "ready" && (
                    <Link className="button primary" to={"/midi/" + p.id}>
                      打开
                    </Link>
                  )}
                  {p.parseStatus === "failed" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () =>
                            api("/api/pieces/" + p.id + "/retry", {
                              method: "POST",
                            }),
                          "已重新排队解析",
                        )
                      }
                    >
                      重试解析
                    </button>
                  )}
                  <button
                    disabled={["pending_review", "removed"].includes(
                      p.publicationStatus,
                    )}
                    onClick={() => {
                      setTitle(p.title);
                      setEdit({ id: p.id, title: p.title, kind: "rename" });
                    }}
                  >
                    重命名
                  </button>
                  <button
                    className="text-danger"
                    onClick={() =>
                      setEdit({ id: p.id, title: p.title, kind: "delete" })
                    }
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
          {cloud?.total === 0 && (
            <Empty title="还没有云端曲目">
              <p>在本机曲库点击“保存到云端”即可添加。</p>
            </Empty>
          )}
          {cloud && <Pager page={page} total={cloud.total} onPage={setPage} />}
        </>
      )}
      {edit && (
        <Modal
          title={edit.kind === "delete" ? "删除曲目" : "修改曲名"}
          onClose={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void applyEdit();
            }}
          >
            {edit.kind === "delete" ? (
              <p>
                确认删除“{edit.title}”？
                {edit.local
                  ? "只删除本机副本，云端曲目不受影响。"
                  : "云端访问会立即关闭，文件稍后清理，本机副本仍保留。"}
              </p>
            ) : (
              <label>
                曲名
                <input
                  required
                  minLength={1}
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                取消
              </button>
              <button
                className="primary"
                disabled={busy || (edit.kind === "rename" && !title.trim())}
              >
                {busy ? "处理中…" : "确认"}
              </button>
            </div>
            <Notice>{message}</Notice>
          </form>
        </Modal>
      )}
    </>
  );
}
