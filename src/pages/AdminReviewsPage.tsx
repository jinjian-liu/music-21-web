import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, json, errorText } from "../lib/api";
import { useAccount } from "../features/account/context";
import type { Page, PieceSummary } from "../../shared/contracts";
import { PageHeading, Notice, Modal, Pager, Empty } from "../components/ui";
interface Report {
  id: string;
  pieceId: string;
  title: string;
  reason: string;
  detail: string;
  status: string;
  publicationStatus: string;
}
interface Audit {
  id: string;
  title: string;
  action: string;
  reason: string;
  createdAt: string;
}
export function AdminReviewsPage() {
  const { user } = useAccount();
  const [tab, setTab] = useState("reviews"),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [reviews, setReviews] = useState<PieceSummary[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [events, setEvents] = useState<Audit[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [rev, setRev] = useState(0);
  const [decision, setDecision] = useState<{
      id: string;
      action: string;
      report?: boolean;
    } | null>(null),
    [reason, setReason] = useState("");
  useEffect(() => {
    let alive = true;
    if (user?.role === "admin")
      void api<Page<any>>("/api/admin/" + tab + "?page=" + page)
        .then((d) => {
          if (!alive) return;
          setTotal(d.total);
          if (tab === "reviews") setReviews(d.items);
          else if (tab === "reports") setReports(d.items);
          else setEvents(d.items);
        })
        .catch((e) => {
          if (alive) setMessage(errorText(e));
        });
    return () => {
      alive = false;
    };
  }, [tab, page, user, rev]);
  async function decide() {
    if (!decision) return;
    setBusy(true);
    try {
      await api(
        decision.report
          ? "/api/admin/reports/" + decision.id
          : "/api/admin/pieces/" + decision.id + "/" + decision.action,
        {
          method: decision.report ? "PATCH" : "POST",
          body: json(
            decision.report ? { status: decision.action, reason } : { reason },
          ),
        },
      );
      setDecision(null);
      setMessage("处理结果已保存");
      setRev((n) => n + 1);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function choose(id: string, action: string, report = false) {
    setReason("");
    setDecision({ id, action, report });
  }
  return (
    <>
      <PageHeading
        eyebrow="CONTENT MODERATION"
        title="内容管理"
        description="审核公开分享，处理举报，保留每一次处理记录。"
      />
      <Notice>{message}</Notice>
      {user?.role !== "admin" ? (
        <Empty title="需要管理员账号">
          <Link to="/settings" className="button">
            账号设置
          </Link>
        </Empty>
      ) : (
        <>
          <div className="segmented">
            {[
              ["reviews", "待审核"],
              ["reports", "举报处理"],
              ["events", "操作记录"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => {
                  setTab(id);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="library-list">
            {tab === "reviews"
              ? reviews.map((p) => (
                  <article className="panel" key={p.id}>
                    <h3>{p.title}</h3>
                    <p>
                      {p.author || "未署名"} · {p.trackCount} 轨 ·{" "}
                      {p.originalName}
                    </p>
                    <blockquote>
                      {p.rightsSource || "未提供授权说明"}
                    </blockquote>
                    <div className="row-actions">
                      <Link className="button" to={"/admin/preview/" + p.id}>
                        预览曲谱
                      </Link>
                      <button
                        className="primary"
                        onClick={() => choose(p.id, "approve")}
                      >
                        批准公开
                      </button>
                      <button onClick={() => choose(p.id, "reject")}>
                        驳回
                      </button>
                    </div>
                  </article>
                ))
              : tab === "reports"
                ? reports.map((r) => (
                    <article className="panel" key={r.id}>
                      <h3>{r.title}</h3>
                      <p>
                        {r.reason} · {r.status}
                      </p>
                      <p>{r.detail}</p>
                      <div className="row-actions">
                        <Link
                          className="button"
                          to={"/admin/preview/" + r.pieceId}
                        >
                          查看曲谱
                        </Link>
                        {r.status === "open" && (
                          <>
                            <button
                              onClick={() => choose(r.id, "resolved", true)}
                            >
                              标记已处理
                            </button>
                            <button
                              onClick={() => choose(r.id, "dismissed", true)}
                            >
                              驳回举报
                            </button>
                          </>
                        )}
                        {r.publicationStatus === "published" && (
                          <button
                            className="text-danger"
                            onClick={() => choose(r.pieceId, "remove")}
                          >
                            下架曲目
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                : events.map((e) => (
                    <article className="library-row" key={e.id}>
                      <div>
                        <h3>{e.title}</h3>
                        <p>
                          {e.action} ·{" "}
                          {new Date(e.createdAt).toLocaleString("zh-CN")}
                        </p>
                        <p>{e.reason || "无补充说明"}</p>
                      </div>
                    </article>
                  ))}
          </div>
          {!total && <Empty title="当前没有待显示的内容" />}
          <Pager page={page} total={total} onPage={setPage} />
        </>
      )}
      {decision && (
        <Modal
          title="确认处理"
          onClose={() => {
            if (!busy) setDecision(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void decide();
            }}
          >
            <p>
              此次操作会写入审核记录。
              {decision.action === "remove" ? "下架后将立即停止公开访问。" : ""}
            </p>
            <label>
              处理说明
              <textarea
                required={decision.action !== "approve"}
                minLength={decision.action !== "approve" ? 3 : 0}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setDecision(null)}>
                取消
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "处理中…" : "确认处理"}
              </button>
            </div>
            <Notice>{message}</Notice>
          </form>
        </Modal>
      )}
    </>
  );
}
