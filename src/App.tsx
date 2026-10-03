import { useEffect, useState } from "react";
import { localDB } from "./lib/local-db";
import { Link } from "react-router-dom";
import { useLocal } from "./lib/use-local";
import { PageHeading, Icon, Notice, duration } from "./components/ui";
import { ImportButton } from "./components/ImportButton";
export function App() {
  const { pieces, sessions, error } = useLocal();
  const minutes = Math.floor(
    sessions.reduce((n, s) => n + s.activeMs, 0) / 60000,
  );
  const imported = pieces[0];
  const [recent, setRecent] = useState<{
    route: string;
    title: string;
    tracks: number;
  } | null>(null);
  useEffect(() => {
    void localDB
      .setting<{ route: string; title: string; tracks: number } | null>(
        "last-workspace",
        null,
      )
      .then(setRecent)
      .catch(() => undefined);
  }, []);
  const last =
    recent ||
    (imported
      ? {
          route: "/midi/" + imported.id,
          title: imported.song.title,
          tracks: imported.song.tracks.length,
        }
      : null);
  return (
    <>
      <PageHeading
        eyebrow="YOUR EVERYDAY MUSIC"
        title="留一点时间，给音乐。"
        description="从一首喜欢的曲子开始，按自己的节奏慢慢进步。"
        action={<ImportButton />}
      />
      <Notice>{error}</Notice>
      <section className="welcome-card">
        <div className="welcome-copy">
          <span className="pill">每一次练习，都算数</span>
          <h2>
            {last
              ? "接着上次的旋律，\n再弹一会儿。"
              : "第一段旋律，\n从这里开始。"}
          </h2>
          <p>
            {last
              ? last.title + " · " + last.tracks + " 条音轨"
              : "无需准备乐器，也可以用电脑键盘开始。"}
          </p>
          <Link
            className="button primary"
            to={last ? last.route : "/midi/demo"}
          >
            <Icon name="play" />
            {last ? "继续练习" : "试弹《小星星》"}
            <Icon name="arrow" />
          </Link>
          <small>看谱 · 听奏 · 跟练，随时切换</small>
        </div>
        <div className="music-art" aria-hidden="true">
          <div className="art-circle" />
          <div className="art-score">
            <span>1　 1　 5　 5</span>
            <span>6　 6　 5　 —</span>
            <span>4　 4　 3　 3</span>
            <i>♪</i>
          </div>
          <div className="art-keys">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                className={[0, 1, 3, 4, 5, 7, 8].includes(i) ? "has-black" : ""}
              />
            ))}
          </div>
          <span className="art-caption">A LITTLE PRACTICE, EVERY DAY.</span>
        </div>
      </section>
      <section className="stat-grid">
        <article>
          <span className="stat-icon">
            <Icon name="history" />
          </span>
          <div>
            <span>累计练习</span>
            <strong>
              {minutes}
              <small> 分钟</small>
            </strong>
          </div>
        </article>
        <article>
          <span className="stat-icon">
            <Icon name="check" />
          </span>
          <div>
            <span>完成练习</span>
            <strong>
              {sessions.length}
              <small> 次</small>
            </strong>
          </div>
        </article>
        <article>
          <span className="stat-icon">
            <Icon name="library" />
          </span>
          <div>
            <span>本机曲库</span>
            <strong>
              {pieces.length}
              <small> 首曲目</small>
            </strong>
          </div>
        </article>
      </section>
      <div className="section-heading">
        <div>
          <p className="eyebrow">PICK UP WHERE YOU LEFT OFF</p>
          <h2>最近的旋律</h2>
        </div>
        <Link to="/library">
          全部曲目 <span>→</span>
        </Link>
      </div>
      <section className="piece-grid">
        {pieces.slice(0, 3).map((p, i) => (
          <Link to={"/midi/" + p.id} className="piece-card" key={p.id}>
            <div className={"piece-art art-" + i}>
              <Icon name="music" size={38} />
              <span>{p.song.inferredKey} 调</span>
            </div>
            <h3>{p.song.title}</h3>
            <p>
              {p.song.tracks.length} 条音轨 <span>·</span>{" "}
              {duration(p.song.durationSeconds)}
            </p>
            <div className="piece-foot">
              <span>本机保存</span>
              <Icon name="arrow" />
            </div>
          </Link>
        ))}
        {!pieces.length && (
          <Link to="/midi/demo" className="piece-card">
            <div className="piece-art art-0">
              <Icon name="music" size={38} />
              <span>入门示例</span>
            </div>
            <h3>小星星</h3>
            <p>从熟悉的旋律认识分轨简谱</p>
            <div className="piece-foot">
              <span>无需导入，即刻体验</span>
              <Icon name="arrow" />
            </div>
          </Link>
        )}
        <div className="piece-card import-card">
          <span className="empty-symbol">
            <Icon name="upload" size={26} />
          </span>
          <h3>你的下一首曲子</h3>
          <p>导入 MIDI，在简谱中找到旋律。</p>
          <ImportButton />
        </div>
      </section>
      <section className="quiet-banner">
        <Icon name="tools" size={28} />
        <div>
          <h3>先调个音，再找准节奏。</h3>
          <p>调音器、节拍器和虚拟钢琴，随时为练习做准备。</p>
        </div>
        <Link to="/tools" className="button">
          打开工具 →
        </Link>
      </section>
    </>
  );
}
