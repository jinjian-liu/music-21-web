# 部署、迁移与恢复

## 本地开发与 Docker

README 中的四个开发步骤使用本机 Node、PostgreSQL 16 和 MinIO。仅运行前端不需要数据库。完整 Compose 使用 app profile；不加 profile 仅启动数据服务。

默认凭据只用于本机开发。公网服务器设置新的 POSTGRES_PASSWORD、S3_ACCESS_KEY_ID、S3_SECRET_ACCESS_KEY，并设置 NODE_ENV=production、APP_ORIGIN=https://实际网站域名、S3_PUBLIC_ENDPOINT=https://实际对象存储域名。数据库密码若含 URL 保留字符，DATABASE_URL 需百分号编码；Compose 默认连接串建议使用 URL 安全密码。

前端镜像由 Nginx 提供静态文件与 /api 反向代理；API 端口仅在 Compose 网络内开放。宿主机上的 HTTPS 代理将网站转发到 WEB_PORT（默认 8080），将对象存储域名转发到 127.0.0.1:9000，保持原始 Host 与路径，不在签名地址前加子路径。MinIO 管理端口 9001 与 PostgreSQL 默认仅绑定回环地址。

S3_ENDPOINT 是 API／Worker 可达的内部地址，S3_PUBLIC_ENDPOINT 是浏览器可达的签名地址；两者可指向同一桶的不同网络入口。对象桶保持私有，CORS 仅放行实际前端 Origin。使用外部 S3 时可只部署 PostgreSQL／API／Worker／Web，修改存储环境变量并停用 MinIO 服务。

Compose 设置 TRUST_PROXY=true 对应信任一跳反向代理，API 必须只由可信 Nginx 访问。代理覆盖实际客户端地址后进程内限流按客户端地址生效。多 API 副本需要共享网关限流。

## 数据迁移

执行 npm run db:migrate。迁移器使用 advisory lock 防止多个迁移同时运行，并通过 schema_migrations 记录完成版本。旧版迁移没有日志；检测到既有 pieces 表时会将 0001 视为已执行，然后按顺序应用剩余迁移。

逐音跟练版本新增 0003_step_practice.sql：扩展练习模式约束以接受 step，并限制该模式的 matched/attempted 为空。保留已有 practice 和 single-note 记录、账号、曲目及链接。更新 API 与 Web 前先执行此迁移；未升级的 API／数据库不能接收 step 记录，但本机练习和保存仍可使用。迁移不会自动上传本机记录。

迁移新增字段与表，不删除旧数据，不修改 UUID、slug 或原对象路径。旧 status 映射至独立解析／公开状态，旧处理中任务回到队列。账号密码和 Cookie 会话保持兼容。运行迁移前备份数据库；升级时停止旧 API 与 Worker，避免旧版本覆盖新状态。

原始 0001 若执行中途失败，应先恢复备份或人工核对表结构，不能将不完整数据库当作完整 v1 自动升级。

## 服务器更新

1. 备份数据库和对象桶，并记录当前镜像版本。
2. 停止旧 API、Worker，保留数据服务。
3. 构建新镜像并运行迁移。
4. 启动 API 与 Worker，验证 /api/ready。
5. 更新 Web，测试登录、导入、云端解析、私人读取及管理员审核。
6. 确认公开链接保持可用。

Compose 可执行 docker compose --profile app up --build -d。首次启动会自动完成桶初始化与数据库迁移。正式部署先固定已验证的镜像 tag 或 digest；当前 MinIO 配置沿用原项目的 latest。

## 备份与恢复

数据库推荐使用容器内 pg_dump 的自定义归档格式，避免 Windows PowerShell 文本重定向破坏二进制备份：

```sh
docker compose exec postgres pg_dump -U music -d music21 -Fc -f /tmp/music21.dump
docker compose cp postgres:/tmp/music21.dump ./music21.dump
```

使用具有读取权限的 MinIO 客户端对私有桶做镜像备份，凭据从运维环境注入，不写入仓库。数据库和对象桶应在同一维护窗口备份。

恢复到新的隔离数据库／桶，先恢复对象文件，再用 pg_restore 恢复数据库并运行迁移。核对原 UUID、slug、文件数量以及抽样解析读取成功后再切换服务。失败回滚优先切回旧镜像和升级前备份；不要对已经写入新状态的数据直接运行旧 Worker。

## 监控与故障恢复

- /api/health 表示 API 进程活着；/api/ready 表示数据库可用。
- 关注 API 错误、Worker 日志、parse_jobs.last_error、failed 任务数量和 processing 租约时间。
- 超时租约五分钟可重领，解析最多自动三次；用户可在云端曲库主动重试。
- 删除后 storage_cleanup 延迟十一分钟执行，失败每五分钟重试；监控长期积压和 attempts。
- 会话记录写入和审核使用数据库事务；对象存储跨系统写入失败不能靠数据库回滚，需定期审计未被 score_object_key 引用的孤立解析对象。
- 定期清理过期会话行，并按业务保留策略归档审计数据。

当前环境没有 Docker，因此容器启动、外部 S3 网络、生产 TLS 和多进程任务争抢须在目标服务器验证。
