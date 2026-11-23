# Proxy Config Hub

Cloudflare 上的个人代理配置下发站。[线上配置中心](https://proxy-config-hub.liuzhenghua66.workers.dev/)可一键复制 OpenClash 覆写模块 URL，以及 Clash Verge 和 Shadowrocket 的配置地址。

## 在 OpenClash 使用

1. **导入覆写模块**。在首页配置库选一份 OpenClash 配置，点击「复制覆写 URL」，到「运行状态 → 覆写模块」从 URL 导入并启用。白名单与 AI 版依赖订阅中的「🔰节点选择」策略组。故障切换版自带 `PROXY` 组。
2. **更新节点订阅**。需要处理加密订阅时，在首页「订阅解密」填入 Clash 格式的原订阅 URL 和对应密码，生成并复制链接，粘贴到「配置订阅 → 订阅地址」。明文订阅的密码可留空。

生成链接时会校验订阅 URL。每次客户端刷新才会下载上游内容和检查密码。服务保留上游订阅格式和 `Subscription-Userinfo` 流量信息。上游需要返回 OpenClash 能读取的 Clash YAML。

## Cloudflare 部署

项目已连到 Git 仓库时，按 Cloudflare 控制台中实际建立的项目类型配置。

| 项目类型 | Git 构建设置 | 运行设置 |
| --- | --- | --- |
| Workers | 根目录为仓库根目录。部署命令 `npx wrangler deploy` | Worker 名称与 `wrangler.jsonc` 的 `name` 一致 |
| Pages | 根目录为仓库根目录。构建命令留空，输出目录为 `public` | 在 Functions 的兼容性标志中添加 `nodejs_compat`，生产和预览环境分别配置 |

在 **运行时**变量和机密中配置以下值后部署。Pages 的生产设置以仪表盘为准。启用 `nodejs_compat` 时兼容日期需为 2024-09-23 或更新。

| 名称 | 类型 | 值 |
| --- | --- | --- |
| `LINK_KEY` | Secret | 用 `openssl rand -hex 32` 生成的 64 位十六进制密钥 |
| `TECH_REPO_TOKEN` | 可选 Secret | `tech` 的只读令牌，用于实时读取配置库 |
| `UPSTREAM_USER_AGENT` | 可选变量 | 上游用客户端标识选择配置格式时设置，默认 `Clash` |

配置文件即使未设置 Secrets 也可公开下载。生成的订阅链接是持有者凭证，其令牌由 AES-256-GCM 加密并验证，包含原始订阅 URL 和密码。链接支持长期自动刷新。更换 `LINK_KEY` 会让所有旧链接失效。若链接泄露，也可以在上游重置订阅凭证。部署时请勿将请求体与完整订阅路径写入访问日志。

直接在表单填写使用公网域名的 HTTPS 订阅 URL。最多跟随三次使用公网域名的 HTTPS 重定向。下载失败时会返回上游 HTTP 状态码。上游响应头 `Subscription-Encryption: true` 时，按 Karing 讨论中的格式解密，即以 UTF-8 密码的 MD5 原始 16 字节为 AES-128-CBC 密钥，Base64 解码后前 16 字节为 IV。该格式只用于上游兼容。参见 [Karing #1346](https://github.com/KaringX/karing/issues/1346)。

## 开发与更新

本地开发需要 Node.js 22 或更新版本。

1. 在仓库根目录运行 `npm ci` 安装依赖。
2. 创建隐藏文件 `.dev.vars`，按下方示例填写。运行 `openssl rand -hex 32` 生成本地 `LINK_KEY`。保留同一把本地密钥，重启后旧订阅链接仍能使用。
3. 运行 `npm run dev`，打开终端显示的本地地址。Pages 项目可用 `npm run dev:pages`。修改 `.dev.vars` 后重启本地服务。

```dotenv
LINK_KEY=REPLACE_WITH_64_HEX_CHARACTERS
# TECH_REPO_TOKEN=REPLACE_WITH_READ_ONLY_GITHUB_TOKEN
# UPSTREAM_USER_AGENT=Clash
```

`.dev.vars` 已被 Git 忽略。本地密钥独立于 Cloudflare Secret，本地生成的链接用于当前开发服务。路由器上的 OpenClash 无法通过电脑的回环地址访问该服务。

提交前运行 `npm test`。修改 Worker 或发布设置后，可运行 `npx wrangler deploy --dry-run` 验证打包。

## 从 tech 实时读取配置

在 GitHub 创建 fine-grained personal access token，仓库只选 `liuzhenghua/tech`，仓库权限设置 `Contents: Read-only`。在 Cloudflare 的生产 Worker 中把令牌添加为运行时 Secret `TECH_REPO_TOKEN`。GitHub 认证细节见 [Repository contents API](https://docs.github.com/en/rest/repos/contents#get-repository-content)。

配置库仍使用本站的 `/config/…` 地址。设置令牌后，每次下载请求都会从 `tech` 的 `main` 分支读取对应文件。GitHub 返回错误时，下载会失败并提示。未设置令牌时，继续使用 `public/config/` 中现有的快照。

`public/config-catalog.js` 同时定义首页条目和公开下载的文件范围。新增公开配置时更新这份清单。

## 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 生成链接成功，但刷新失败 | 打开生成的链接查看错误。上游请求和解密在刷新时执行，生成时只校验 URL 和输入格式。 |
| 上游返回 HTTP 403 | 用同一订阅测试本地 Worker。若本地能刷新而线上失败，检查订阅服务商对 Cloudflare 请求的访问规则。 |
| 提示订阅解密失败 | 核对原订阅对应的登录密码及上游加密格式。 |
| 提示暂时无法从 tech 仓库读取配置 | 检查运行时令牌是否过期、是否包含 `tech` 的 `Contents: Read-only` 权限，以及文件是否在其 `main` 分支。 |
