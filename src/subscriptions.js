import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const tokenContext = encoder.encode('proxy-config-hub/sub/v1');
const maxSubscriptionBytes = 4 * 1024 * 1024;
const noStore = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function subscriptionUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new RequestError(400, '请输入有效的 HTTPS 订阅地址');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new RequestError(400, '请输入不含身份字段和片段的 HTTPS 订阅地址');
  }
  const hostname = url.hostname.replace(/\.$/, '');
  if (!hostname.includes('.') || /^\d+(\.\d+){3}$/.test(hostname) ||
      /\.(localhost|local|internal|home\.arpa)$/.test(hostname)) {
    throw new RequestError(400, '订阅地址须使用公网域名');
  }
  return url;
}

async function tokenKey(env) {
  if (!/^[0-9a-f]{64}$/i.test(env.LINK_KEY ?? '')) {
    throw new RequestError(503, '服务尚未配置链接密钥');
  }
  return crypto.subtle.importKey('raw', Buffer.from(env.LINK_KEY, 'hex'), 'AES-GCM', false, [
    'encrypt', 'decrypt',
  ]);
}

function gcm(iv) {
  return { name: 'AES-GCM', iv, additionalData: tokenContext };
}

async function seal(payload, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(gcm(iv), key, encoder.encode(JSON.stringify(payload)));
  return Buffer.concat([iv, new Uint8Array(encrypted)]).toString('base64url');
}

async function unseal(token, key) {
  if (!/^[A-Za-z0-9_-]{40,10000}$/.test(token)) {
    throw new RequestError(404, '订阅链接无效');
  }
  const raw = Buffer.from(token, 'base64url');
  try {
    if (raw.toString('base64url') !== token) throw new Error('Invalid encoding');
    const plaintext = await crypto.subtle.decrypt(gcm(raw.subarray(0, 12)), key, raw.subarray(12));
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new RequestError(404, '订阅链接无效');
  }
}

async function readLimited(stream, maxBytes, error) {
  if (!stream) return Buffer.alloc(0);
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function decryptSubscription(body, password) {
  if (!password) throw new RequestError(422, '该上游订阅需要解密密码，请重新生成链接');
  try {
    const encoded = decoder.decode(body).replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid encoding');
    const raw = Buffer.from(encoded, 'base64');
    if (raw.length < 32 || raw.length % 16 !== 0) throw new Error('Invalid block length');
    const digest = createHash('md5').update(password, 'utf8').digest();
    const key = await crypto.subtle.importKey('raw', digest, 'AES-CBC', false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: raw.subarray(0, 16) }, key, raw.subarray(16),
    );
    if (!decrypted.byteLength) throw new Error('Empty subscription');
    decoder.decode(decrypted);
    return decrypted;
  } catch {
    throw new RequestError(422, '订阅解密失败，请检查密码及上游加密格式');
  }
}

async function generate(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    throw new RequestError(415, '请提交 JSON 表单');
  }
  const bytes = await readLimited(request.body, 8192, new RequestError(413, '表单过大'));
  let data;
  try {
    data = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new RequestError(400, '无法读取表单');
  }
  if (typeof data?.url !== 'string' || data.url.length > 2048 ||
      typeof data.password !== 'string' || encoder.encode(data.password).length > 512) {
    throw new RequestError(400, '订阅地址或密码格式不正确');
  }
  const upstream = subscriptionUrl(data.url);
  const token = await seal({ url: upstream.href, password: data.password }, await tokenKey(env));
  if (token.length > 10000) throw new RequestError(400, '订阅地址或密码过长');
  return Response.json({ path: '/sub/' + token }, { headers: noStore });
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxRedirects = 3;

async function downloadUpstream(url, env, fetchUpstream) {
  const signal = AbortSignal.timeout(12000);
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let response;
    try {
      response = await fetchUpstream(current.href, {
        headers: { 'User-Agent': env.UPSTREAM_USER_AGENT || 'Clash' },
        redirect: 'manual',
        cache: 'no-store',
        signal,
      });
    } catch {
      throw new RequestError(502, '无法连接上游订阅');
    }
    if (response.ok) return response;
    await response.body?.cancel().catch(() => {});
    if (!redirectStatuses.has(response.status)) {
      throw new RequestError(502, '上游订阅返回 HTTP ' + response.status);
    }
    if (hop === maxRedirects) throw new RequestError(502, '上游订阅重定向次数过多');
    current = redirectTarget(current, response.headers.get('Location'));
  }
}

function redirectTarget(current, location) {
  if (!location) throw new RequestError(502, '上游重定向缺少目标地址');
  try {
    return subscriptionUrl(new URL(location, current).href);
  } catch {
    throw new RequestError(502, '上游重定向目标须使用公网域名和 HTTPS');
  }
}

async function fetchSubscription(request, token, env, fetchUpstream) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const data = await unseal(token, await tokenKey(env));
  const upstream = subscriptionUrl(data.url);
  const response = await downloadUpstream(upstream, env, fetchUpstream);

  let content;
  try {
    content = await readLimited(response.body, maxSubscriptionBytes, new RequestError(502, '上游订阅过大'));
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(502, '读取上游订阅失败');
  }
  if (!content.length) throw new RequestError(502, '上游返回空订阅');
  const encryption = response.headers.get('Subscription-Encryption')?.trim().toLowerCase();
  if (encryption && encryption !== 'true' && encryption !== 'false') {
    throw new RequestError(422, '上游使用了未知的订阅加密格式');
  }

  const headers = new Headers({
    ...noStore,
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  const userinfo = response.headers.get('Subscription-Userinfo');
  if (userinfo) headers.set('Subscription-Userinfo', userinfo);
  const body = encryption === 'true' ? await decryptSubscription(content, data.password) : content;
  return new Response(body, { headers });
}

function methodNotAllowed(allow) {
  return Response.json({ error: '请求方法不受支持' }, { status: 405, headers: { ...noStore, Allow: allow } });
}

export async function handleSubscription(request, env, fetchUpstream = fetch) {
  const path = new URL(request.url).pathname;
  try {
    if (path === '/api/links') return await generate(request, env);
    if (path.startsWith('/sub/')) return await fetchSubscription(request, path.slice(5), env, fetchUpstream);
    return null;
  } catch (error) {
    const status = error instanceof RequestError ? error.status : 500;
    return Response.json({ error: status === 500 ? '订阅服务暂时不可用' : error.message }, {
      status, headers: noStore,
    });
  }
}
