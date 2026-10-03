import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Page, PieceSummary } from "../../shared/contracts";
import { api, errorText } from "../lib/api";
import {
  PageHeading,
  Notice,
  Empty,
  Pager,
  Icon,
  duration,
} from "../components/ui";
export function GalleryPage() {
  const [q, setQ] = useState(""),
    [sort, setSort] = useState("latest"),
    [page, setPage] = useState(1),
    [data, setData] = useState<Page<PieceSummary> | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const t = setTimeout(() => {
      void api<Page<PieceSummary>>(
        "/api/gallery?" + new URLSearchParams({ q, sort, page: String(page) }),
      )
        .then((d) => {
          if (alive) setData(d);
        })
        .catch((e) => {
          if (alive) {
            setData(null);
            setError(errorText(e));
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, sort, page, reload]);
  return (
    <>
      <PageHeading
        eyebrow="DISCOVER YOUR NEXT MELODY"
        title="发现曲目"
        description="听见新的旋律，也找到下一次练习的灵感。"
      />
      <Link to="/midi/demo" className="discovery-feature">
        <div>
          <span className="pill">精选入门 · 内置示例</span>
          <h2>一闪一闪，慢慢熟练。</h2>
          <p>用《小星星》体验分轨简谱与伴奏跟练。</p>
          <span className="button primary">开始体验 →</span>
        </div>
        <span className="feature-notes" aria-hidden="true">
          1 1 5 5<br />6 6 5 —
        </span>
      </Link>
      <div className="toolbar">
        <input
          aria-label="搜索公开曲目"
          placeholder="搜索曲名或作者…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="公开曲目排序"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          <option value="latest">最新发布</option>
          <option value="popular">最多播放</option>
        </select>
        <span className="muted">{data ? data.total + " 首公开曲目" : ""}</span>
      </div>
      <Notice>
        {error && (
          <>
            {error}{" "}
            <button onClick={() => setReload((n) => n + 1)}>重新加载</button>
          </>
        )}
      </Notice>
      {loading ? (
        <p className="muted" role="status">
          正在寻找旋律…
        </p>
      ) : data?.items.length ? (
        <section className="piece-grid">
          {data.items.map((p, i) => (
            <Link to={"/pieces/" + p.slug} className="piece-card" key={p.slug}>
              <div className={"piece-art art-" + (i % 3)}>
                <Icon name="music" size={36} />
                <span>{p.inferredKey || "调性待定"}</span>
              </div>
              <h3>{p.title}</h3>
              <p>
                {p.author || "未署名"} · {duration(p.durationSeconds || 0)}
              </p>
              <div className="piece-foot">
                <span>{p.trackCount} 条音轨</span>
                <Icon name="arrow" />
              </div>
            </Link>
          ))}
        </section>
      ) : (
        !error && (
          <Empty title={q ? "没有找到这段旋律" : "等待第一首分享"}>
            <p>
              {q
                ? "试试其他曲名或作者。"
                : "审核通过的曲目会出现在这里，你也可以先体验示例。"}
            </p>
          </Empty>
        )
      )}
      {data && <Pager page={page} total={data.total} onPage={setPage} />}
    </>
  );
}
