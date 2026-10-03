import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLocal } from "../lib/use-local";
import { useAccount } from "../features/account/context";
import { api, json, errorText } from "../lib/api";
import type { Page, PracticeSession } from "../../shared/contracts";
import { PageHeading, Notice, Empty, Pager } from "../components/ui";
export function PracticePage() {
  const { sessions, error } = useLocal(),
    { user } = useAccount();
  const [tab, setTab] = useState("local"),
    [cloud, setCloud] = useState<Page<PracticeSession> | null>(null),
    [page, setPage] = useState(1),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [rev, setRev] = useState(0);
  const [summary, setSummary] = useState<{
    sessions: number;
    activeMs: number | string;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    if (tab === "cloud" && user)
      void Promise.all([
        api<Page<PracticeSession>>("/api/practice/sessions?page=" + page),
        api<{ sessions: number; activeMs: number | string }>(
          "/api/practice/summary",
        ),
      ])
        .then(([d, s]) => {
          if (alive) {
            setCloud(d);
            setSummary(s);
          }
        })
        .catch((e) => {
          if (alive) setMessage(errorText(e));
        });
    return () => {
      alive = false;
    };
  }, [tab, user, page, rev]);
  async function sync() {
    setBusy(true);
    try {
      for (let i = 0; i < sessions.length; i += 100)
        await api("/api/practice/sessions/batch", {
          method: "POST",
          body: json({ sessions: sessions.slice(i, i + 100) }),
        });
      setMessage("练习记录已保存到当前账号，重复保存不会重复计数");
      setRev((n) => n + 1);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const list = tab === "local" ? sessions : cloud?.items || [];
  const total = tab === "local" ? sessions.length : summary?.sessions || 0;
  const active =
    tab === "local"
      ? sessions.reduce((n, s) => n + s.activeMs, 0)
      : Number(summary?.activeMs || 0);
  return (
    <>
      <PageHeading
        eyebrow="SMALL STEPS, REAL PROGRESS"
        title="每一点进步，都留下来。"
        description="只记录真实练习。停下来休息的时间，不计入练习时长。"
        action={
          <button
            className="primary"
            disabled={busy || !sessions.length}
            onClick={() => void sync()}
          >
            {busy ? "正在保存…" : "保存本机记录到云端"}
          </button>
        }
      />
      <Notice>{message || error}</Notice>
      <p className="caption">
        主动保存将上传本机练习的曲名、时间和练习模式，不上传录音。
      </p>
      <div className="segmented">
        <button
          className={tab === "local" ? "active" : ""}
          onClick={() => setTab("local")}
        >
          本机记录
        </button>
        <button
          className={tab === "cloud" ? "active" : ""}
          onClick={() => setTab("cloud")}
        >
          账号记录
        </button>
      </div>
      <div className="stat-grid">
        <article>
          <div>
            <span>有效练习时长</span>
            <strong>
              {Math.floor(active / 60000)}
              <small> 分钟</small>
            </strong>
          </div>
        </article>
        <article>
          <div>
            <span>完成练习</span>
            <strong>
              {total}
              <small> 次</small>
            </strong>
          </div>
        </article>
      </div>
      {tab === "cloud" && !user ? (
        <Empty title="登录后查看账号记录">
          <Link to="/settings" className="button">
            前往登录
          </Link>
        </Empty>
      ) : !list.length ? (
        <Empty title="第一份记录，等你开始">
          <p>在工作台选择“伴奏跟练”，播放后点击结束练习即可保存。</p>
          <Link to="/midi/demo" className="button primary">
            开始练习
          </Link>
        </Empty>
      ) : (
        <div className="library-list">
          {list.map((s) => (
            <article className="library-row" key={s.id}>
              <span className="song-symbol">♪</span>
              <div className="row-main">
                <h3>{s.title}</h3>
                <p>
                  {new Date(s.startedAt).toLocaleString("zh-CN")} ·{" "}
                  {s.mode === "single-note" ? "单音练习" : "伴奏跟练"}
                </p>
              </div>
              <div>
                <strong>
                  {Math.floor(s.activeMs / 60000)} 分{" "}
                  {Math.floor(s.activeMs / 1000) % 60} 秒
                </strong>
                <p className="caption">
                  {s.attempted === null
                    ? "过程记录 · 未评分"
                    : s.matched + " / " + s.attempted + " 次命中"}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
      {tab === "cloud" && cloud && (
        <Pager page={page} total={cloud.total} onPage={setPage} />
      )}
    </>
  );
}
