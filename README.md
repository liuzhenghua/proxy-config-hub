# Proxy Config Hub

Cloudflare 上的个人代理配置下发站。首页可一键复制 OpenClash 覆写模块 URL，以及 Clash Verge 和 Shadowrocket 的配置地址。

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
| `UPSTREAM_USER_AGENT` | 可选变量 | 上游用客户端标识选择配置格式时设置，默认 `Clash` |

配置文件即使未设置 Secrets 也可公开下载。生成的订阅链接是持有者凭证，其令牌由 AES-256-GCM 加密并验证，包含原始订阅 URL 和密码。链接支持长期自动刷新。更换 `LINK_KEY` 会让所有旧链接失效。若链接泄露，也可以在上游重置订阅凭证。部署时请勿将请求体与完整订阅路径写入访问日志。

直接在表单填写使用公网域名的 HTTPS 订阅 URL。上游返回重定向时下载失败，请使用直接返回配置的订阅地址。上游响应头 `Subscription-Encryption: true` 时，按 Karing 讨论中的格式解密，即以 UTF-8 密码的 MD5 原始 16 字节为 AES-128-CBC 密钥，Base64 解码后前 16 字节为 IV。该格式只用于上游兼容。参见 [Karing #1346](https://github.com/KaringX/karing/issues/1346)。

## 开发与更新

本地开发需要 Node.js 22 或更新版本。

```sh
npm ci
npm test
npm run dev
```

本地订阅解密可在未跟踪的 `.dev.vars` 中设置运行时变量。使用 Pages 项目时，可运行 `npm run dev:pages` 预览。

`public/config/` 包含 [tech 仓库](https://github.com/liuzhenghua/tech/tree/main/infra)对应文件的快照。更新规则时，从对应的 `infra/<客户端>/` 同步原文件。如果新增或移除文件，同时更新 `public/app.js` 中的清单。
