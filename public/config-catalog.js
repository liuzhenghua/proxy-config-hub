export const configs = [
  {
    client: 'OpenClash',
    directory: 'openclash',
    files: [
      ['proxy-whitelist-fallback.conf', '白名单 · 自动故障切换', '自带 PROXY 策略组，按手动优先节点顺序切换。'],
      ['proxy-whitelist.conf', '常用服务白名单', '常用境外服务走代理，其余直连。使用订阅中的「🔰节点选择」。'],
      ['ai-only.conf', 'AI 服务白名单', '代理 OpenAI、ChatGPT 和 Claude。使用订阅中的「🔰节点选择」。'],
    ],
  },
  {
    client: 'Clash Verge',
    directory: 'clash-verge',
    files: [
      ['proxy-fallback.yaml', '代理故障切换', 'YAML 扩展配置。'],
      ['prepend-direct-rules.js', '直连规则前置', 'JavaScript 扩展脚本。'],
    ],
  },
  {
    client: 'Shadowrocket',
    directory: 'shadowrocket',
    files: [
      ['proxy-whitelist.conf', '常用服务白名单', '代理常用境外服务，其余直连。'],
      ['ai-only.conf', 'AI 服务白名单', '代理 OpenAI、ChatGPT 和 Claude。'],
    ],
  },
];
