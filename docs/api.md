# API 约定

所有路径保留 /api 前缀。浏览器同源调用，携带会话 Cookie。跨域开发只允许 WEB_ORIGIN。请求与响应正文为 JSON；删除成功为 204。

错误格式为 { "error": "CODE" }，参数校验错误可附 details。401 为未登录，403 为权限或 Origin 拒绝，404 为不存在／不可见，409 为状态冲突，429 为频率或上传配额，503 为服务不可用。客户端将错误码转换为中文。

## 账号

- POST /auth/register：email、password（10–128 位）、displayName（2–60 字）。返回 Account，设置会话。
- POST /auth/login：email、password。返回 Account。
- POST /auth/logout：撤销当前会话。
- GET /auth/me：返回 id、email、displayName、role。
- PATCH /account：displayName。
- GET /account/settings、PUT /account/settings：{ audio: { volume: 0–100, resonance: 0–65, tone: grand|bright|mellow|electric } }。

## 上传与私人曲库

- POST /uploads/intents：clientId（建议必传稳定本地 ID）、fileName、size、title、contentType。上限 10 MB，每账号每天最多 20 个新意图；返回 pieceId、parseStatus、uploadUrl、expiresIn。已排队／已完成的幂等请求 uploadUrl 为 null。浏览器 PUT 使用 audio/midi。
- POST /pieces/:id/complete：验证对象长度并幂等入队，返回 pieceId、parseStatus。
- POST /pieces/:id/retry：仅解析失败曲目可用；重新入队并重置次数。
- GET /pieces：账号曲库分页，支持 q、sort=latest|title、page、pageSize。
- GET /pieces/:id/status：PieceSummary 和兼容 status。
- GET /pieces/:id/score：返回 ParsedSong v1；未就绪为 NOT_READY。
- PATCH /pieces/:id：可选 title、author、rightsSource、rightsConfirmed、rightsExpiresAt（ISO 日期或 null）。待审核／下架禁止编辑，已公开信息更新后重新审核。
- POST /pieces/:id/submit-review：检查就绪、权限声明和状态后入审。
- DELETE /pieces/:id：软删除并排队清理对象。

分页格式：{ items: [], total, page, pageSize }，默认 page=1、pageSize=12，上限 50。PieceSummary 类型定义位于 shared/contracts.ts。

## 公开曲目

- GET /gallery：q 搜索曲名／作者，sort=latest|popular，page、pageSize。提供 page 参数时返回分页；省略 page 时保留旧版数组格式。
- GET /public/pieces/:slug：返回 { piece, score }，只读，不增加播放数。
- POST /public/pieces/:slug/play：显式记录一次开始播放，计数使用 SQL 原子加一。客户端每次打开工作台最多发一次；不是防刷或独立用户统计。
- POST /public/pieces/:slug/reports：email、reason=copyright|abuse|incorrect|other、detail（3–2000 字）。

## 练习

- POST /practice/sessions/batch：{ sessions: PracticeSession[] }，每批最多 100 条，按账号和 UUID 幂等保存。
- GET /practice/sessions：page、pageSize；按开始时间倒序。
- GET /practice/summary：{ sessions, activeMs }；activeMs 可能是数据库 bigint 字符串，客户端应转为 Number。

PracticeSession 包含 id、pieceId、title、mode=practice|single-note|step、targetTrackId（可空）、startedAt、endedAt、activeMs、matched 与 attempted（均可空）。后端拒绝负时长、倒置时间、超出会话跨度的有效时长和不一致命中数。step 表示逐音跟练，matched 与 attempted 必须均为 null；记录有效练习时长，不上传本轮组数作为评分。接口路径与按会话 UUID 去重规则不变。

## 管理

以下接口均要求 admin 角色：

- GET /admin/reviews：待审核分页，省略 page 兼容旧数组。
- GET /admin/pieces/:id/score：预览私人、待审或下架曲谱。
- POST /admin/pieces/:id/approve|reject|remove：reason；驳回／下架至少三个字。
- GET /admin/reports：举报分页。
- PATCH /admin/reports/:id：status=resolved|dismissed、reason（至少三字）；只有 open 可处理。
- GET /admin/events：审核与举报处理历史分页。

GET /health 为进程存活检查；GET /ready 检查 PostgreSQL 可用性。对象存储及 Worker 状态需另行监控。
