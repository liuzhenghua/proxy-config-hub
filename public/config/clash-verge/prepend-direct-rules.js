// Paste into Clash Verge Rev's global extension script.
function main(config) {
  // Explicitly preserve the intent of removed subscription groups.
  const removedTargetMappings = new Map([
    ["🧱国内网络", "DIRECT"],
    ["🎯不用代理", "DIRECT"],
  ]);
  const prepend = [
    "DOMAIN-SUFFIX,seagm.com,DIRECT",
    "DOMAIN-SUFFIX,cn,DIRECT",
    "DOMAIN-KEYWORD,ali,DIRECT",
    "DOMAIN-KEYWORD,mirror,DIRECT",
    "IP-CIDR,11.0.0.0/8,DIRECT",
    "DOMAIN-KEYWORD,qifu,DIRECT",
    "DOMAIN-KEYWORD,qihoo,DIRECT",
    "DOMAIN-KEYWORD,360,DIRECT",
  ];
  const targets = new Set([
    "DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL", "DNS",
    ...(config.proxies ?? []).map((proxy) => proxy.name),
    ...(config["proxy-groups"] ?? []).map((group) => group.name),
  ]);
  const rules = (config.rules ?? []).map((rule) =>
    remapTarget(rule, targets, removedTargetMappings)
  );
  const priorityRules = new Set(prepend);
  config.rules = [...prepend, ...rules.filter((rule) => !priorityRules.has(rule))];
  return config;
}

// Logical rules may contain commas; the outbound target is at the end.
function remapTarget(rule, targets, removedTargetMappings) {
  if (rule.startsWith("SUB-RULE,")) return rule;
  const parts = rule.split(",");
  const index = parts.length - (parts.at(-1).trim() === "no-resolve" ? 2 : 1);
  const target = parts[index].trim();
  if (!targets.has(target)) {
    parts[index] = removedTargetMappings.get(target) ?? "PROXY";
  }
  return parts.join(",");
}
