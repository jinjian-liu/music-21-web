import { useEffect, useState } from "react";
import { useAccount } from "../features/account/context";
import { api, json, errorText } from "../lib/api";
import { localDB } from "../lib/local-db";
import { defaultAudio, type AudioPreferences } from "../../shared/contracts";
import { PageHeading, Notice, Modal } from "../components/ui";
export function SettingsPage() {
  const { user, refresh, error: accountError } = useAccount();
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [clear, setClear] = useState(false),
    [audio, setAudio] = useState<AudioPreferences>(defaultAudio);
  useEffect(() => {
    setName(user?.displayName || "");
  }, [user]);
  useEffect(() => {
    void localDB
      .setting("audio", defaultAudio)
      .then(setAudio)
      .catch((e) => setMessage(errorText(e)));
  }, []);
  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      setMessage(success);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="账号与偏好"
        description="让声音和习惯，都贴近你自己。"
      />
      <Notice>{message || accountError}</Notice>
      <div className="settings-grid">
        <section className="panel">
          <h2>{user ? "你的账号" : register ? "创建账号" : "欢迎回来"}</h2>
          {user ? (
            <>
              <p className="muted">{user.email}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await api("/api/account", {
                      method: "PATCH",
                      body: json({ displayName: name }),
                    });
                    await refresh();
                  }, "显示名称已更新");
                }}
              >
                <label>
                  显示名称
                  <input
                    required
                    minLength={2}
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="row-actions">
                  <button className="primary" disabled={busy}>
                    保存名称
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api("/api/auth/logout", { method: "POST" });
                        await refresh();
                      }, "已退出账号")
                    }
                  >
                    退出登录
                  </button>
                </div>
              </form>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  await api("/api/auth/" + (register ? "register" : "login"), {
                    method: "POST",
                    body: json({
                      email,
                      password,
                      ...(register ? { displayName: name } : {}),
                    }),
                  });
                  setPassword("");
                  await refresh();
                }, "登录成功。本机文件不会自动上传。");
              }}
            >
              {register && (
                <label>
                  显示名称
                  <input
                    required
                    minLength={2}
                    maxLength={60}
                    autoComplete="nickname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              <label>
                邮箱
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                密码
                <input
                  required
                  minLength={10}
                  maxLength={128}
                  type="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder="至少 10 位"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "处理中…" : register ? "注册并登录" : "登录"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setRegister((v) => !v)}
              >
                {register ? "已有账号，去登录" : "没有账号？创建一个"}
              </button>
            </form>
          )}
        </section>
        <section className="panel">
          <h2>声音偏好</h2>
          <p className="muted">用于虚拟钢琴，新打开练习时生效。</p>
          <label>
            音色
            <select
              value={audio.tone}
              onChange={(e) =>
                setAudio({
                  ...audio,
                  tone: e.target.value as AudioPreferences["tone"],
                })
              }
            >
              <option value="grand">原声钢琴</option>
              <option value="mellow">柔和钢琴</option>
              <option value="bright">明亮钢琴</option>
              <option value="electric">电钢琴</option>
            </select>
          </label>
          <label>
            音量 · {audio.volume}%
            <input
              type="range"
              min="0"
              max="100"
              value={audio.volume}
              onChange={(e) => setAudio({ ...audio, volume: +e.target.value })}
            />
          </label>
          <label>
            共鸣 · {audio.resonance}%
            <input
              type="range"
              min="0"
              max="65"
              value={audio.resonance}
              onChange={(e) =>
                setAudio({ ...audio, resonance: +e.target.value })
              }
            />
          </label>
          <div className="row-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void action(
                  () => localDB.setSetting("audio", audio),
                  "已保存本机声音偏好",
                )
              }
            >
              保存本机偏好
            </button>
            {user && (
              <>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(
                      () =>
                        api("/api/account/settings", {
                          method: "PUT",
                          body: json({ audio }),
                        }),
                      "声音偏好已保存到账号",
                    )
                  }
                >
                  保存到账号
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const d = await api<{ audio: AudioPreferences }>(
                        "/api/account/settings",
                      );
                      await localDB.setSetting("audio", d.audio);
                      setAudio(d.audio);
                    }, "已应用账号声音偏好")
                  }
                >
                  应用账号偏好
                </button>
              </>
            )}
          </div>
        </section>
        <section className="panel">
          <h2>本机数据</h2>
          <p className="muted">
            曲目、练习记录和偏好保存在当前浏览器。删除前请保留原始
            MIDI，或主动保存到云端。
          </p>
          <button className="text-danger" onClick={() => setClear(true)}>
            清除本机数据
          </button>
        </section>
      </div>
      {clear && (
        <Modal title="清除本机数据？" onClose={() => setClear(false)}>
          <p>
            这会删除当前浏览器的全部曲目、练习记录和偏好。云端账号的数据不受影响，此操作不能撤销。
          </p>
          <div className="modal-actions">
            <button onClick={() => setClear(false)}>取消</button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await localDB.clear();
                  setAudio(defaultAudio);
                  setClear(false);
                }, "本机数据已清除")
              }
            >
              确认清除
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
