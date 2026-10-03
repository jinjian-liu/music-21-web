# 弦知 · 让练习自然发生

面向业余音乐学习者的练琴与曲谱平台。React 19 + TypeScript + Vite，Fastify API，PostgreSQL，S3 兼容对象存储。

## 从这里开始

仅体验本机曲库、简谱、虚拟钢琴与练习记录：

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

打开 http://127.0.0.1:5173 。示例工作台位于 /midi/demo。后端不可用不会阻止本机导入和练习。

完整本地云端环境：

1. 将 .env.example 复制为 .env。
2. 运行 `docker compose up -d` 启动 PostgreSQL、MinIO 和私有桶初始化。
3. 运行 `npm run db:migrate`。
4. 分别运行 `npm run dev:server`、`npm run dev:worker`、`npm run dev`。
5. 注册账号后，使用 `npm run admin:create -- 邮箱` 为指定账号配置管理员角色。

完整容器环境：

```sh
docker compose --profile app up --build -d
```

打开 http://127.0.0.1:8080 。API 与 Worker 分别运行；迁移自动先于它们执行。生产环境的 HTTPS、对象存储域名和凭据配置见部署文档。

## 页面与功能

- **概览 /**：最近本机曲目、继续练习、真实本机练习摘要和 MIDI 导入。
- **我的曲库 /library**：本机／私人云端视图，搜索与排序，重命名、删除、主动云端保存、解析失败重试。
- **发现曲目 /gallery**：公开曲目搜索、最新／热门排序、分页、内置示例。
- **练琴工作台 /midi/:pieceId**：分轨简谱、轨道静音与独奏、目标轨伴奏跟练、首调／固定调、变速、循环、拖动定位、折叠键盘。
- **公开曲目 /pieces/:slug**：保留旧分享链接；公开读取、练习和举报。
- **练习记录 /practice**：有效时长、历史会话、本机与账号视图、主动批量保存。
- **工具 /tools**：虚拟钢琴、单音调音与设备检测、节拍器、C 大调五音麦克风练习。
- **账号与偏好 /settings**：注册登录、退出、显示名称、声音偏好、本机数据清理。
- **管理后台 /admin/reviews**：待审核、曲谱预览、批准／驳回、举报处理与下架、审计历史。

## 数据原则

本机文件、解析结果、练习记录与工作台偏好使用 IndexedDB。登录不自动上传，保存到云端是用户明确发起的操作。保存曲目上传原 MIDI；保存练习记录上传曲名、模式和时长，不上传录音。清除浏览器数据会移除本机副本，请保留原 MIDI。

解析状态与发布状态独立。上传失败不影响本机使用；发布必须先完成解析并提供权利声明。已公开曲目的信息修改会重新进入审核，下架立即关闭公开访问。

练习时长只记录主动启动的伴奏跟练／单音练习，暂停和普通听奏不计入。跟练音符命中是即时提示，尚未形成完整评分模型，因此历史记录不显示虚假的准确率。

旧 sessionStorage 中仍可读取的曲目会迁入 IndexedDB；只有最近列表而没有内容的曲目提示重新导入。服务端迁移保留用户、曲目 ID、slug 和对象路径。原 PRD 保留作历史参考，新实现边界以本 README 和 docs/implementation.md 为准。

## 工程结构

- src/pages、src/features：页面与账号／练习业务。
- src/components：布局、弹窗、统一反馈、导入、键盘与谱面。
- src/lib：API、IndexedDB、云端保存。
- src/audio：播放、合成、输入检测；音频留在浏览器处理。
- shared：浏览器与服务端共用的 MIDI 解析、曲谱类型和接口类型。
- server/routes：HTTP 参数校验及功能路由。
- server/services：状态转换与审核事务。
- server/repository.ts、server/schema.ts：SQL 数据访问及 Drizzle schema。
- server/worker.ts、server/parse-worker.ts：独立解析与删除清理 Worker。
- server/migrations：增量数据库迁移。

## 验证

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

测试包含原有音高／键盘／简谱测试、IndexedDB、会话计时、嵌入式 PostgreSQL API 集成与 Chromium 用户流程。真实麦克风音准、真实 S3 和多进程 Worker 的生产环境验收范围见 docs/verification.md。

## 文档

- [实现与产品边界](docs/implementation.md)
- [接口约定](docs/api.md)
- [部署、迁移与恢复](docs/deployment.md)
- [验证结果与环境限制](docs/verification.md)
- [第三方许可](THIRD_PARTY_NOTICES.md)
