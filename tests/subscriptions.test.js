import assert from 'node:assert/strict';
import { createCipheriv, createHash } from 'node:crypto';
import test from 'node:test';
import { handleSubscription } from '../src/subscriptions.js';

const env = { LINK_KEY: 'ab'.repeat(32) };
const base = 'https://hub.example';
const url = 'https://provider.example/config?token=private-value';
const plaintext = 'proxies: []\n';
const password = '测试密钥';

function generateRequest(subscription, secret) {
  return new Request(base + '/api/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: subscription, password: secret }),
  });
}

async function generate(secret = password) {
  const response = await handleSubscription(generateRequest(url, secret), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return (await response.json()).path;
}

function encryptedResponse() {
  const iv = Buffer.alloc(16, 2);
  const key = createHash('md5').update(password).digest();
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  const body = Buffer.concat([iv, cipher.update(plaintext), cipher.final()]);
  return new Response(body.toString('base64'), {
    headers: { 'Subscription-Encryption': ' True ', 'Subscription-Userinfo': 'upload=0; download=0' },
  });
}

test('creates randomized opaque links and decrypts a fresh upstream response on every refresh', async () => {
  const path = await generate();
  assert.notEqual(path, await generate());
  assert.match(path, /^\/sub\/[A-Za-z0-9_-]+$/);
  assert.ok(!path.includes('private-value'));

  let calls = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await handleSubscription(new Request(base + path), env, (target, options) => {
      assert.equal(target, url);
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers['User-Agent'], 'Clash');
      calls++;
      return encryptedResponse();
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), plaintext);
    assert.equal(response.headers.get('subscription-encryption'), null);
    assert.equal(response.headers.get('subscription-userinfo'), 'upload=0; download=0');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls, 2);
});

test('returns a plain subscription unchanged, with an empty password', async () => {
  const path = await generate('');
  const response = await handleSubscription(new Request(base + path), env, () => new Response(plaintext));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), plaintext);
});

test('rejects wrong and missing passwords for encrypted subscriptions', async () => {
  for (const secret of ['wrong', '']) {
    const path = await generate(secret);
    const response = await handleSubscription(new Request(base + path), env, encryptedResponse);
    assert.equal(response.status, 422);
  }
});

test('accepts different subscription domains without server-side configuration', async () => {
  for (const input of [url, 'https://other.example:8443/subscription']) {
    const generated = await handleSubscription(generateRequest(input, password), env);
    assert.equal(generated.status, 200);
    const { path } = await generated.json();
    const response = await handleSubscription(new Request(base + path), env, upstream => {
      assert.equal(upstream, input);
      return new Response(plaintext);
    });
    assert.equal(response.status, 200);
  }
});

test('rejects insecure URLs, embedded credentials, and local address forms', async () => {
  for (const input of [
    'http://provider.example',
    'https://user@provider.example',
    'https://localhost',
    'https://printer.local',
    'https://service.internal',
    'https://router.home.arpa',
    'https://127.0.0.1',
    'https://2130706433',
    'https://[::1]',
  ]) {
    assert.equal((await handleSubscription(generateRequest(input, password), env)).status, 400);
  }
});

test('rejects modified tokens and tokens encrypted with a rotated key', async () => {
  const path = await generate();
  const edited = path.slice(0, 5) + (path[5] === 'a' ? 'b' : 'a') + path.slice(6);
  assert.equal((await handleSubscription(new Request(base + edited), env, assert.fail)).status, 404);
  const rotated = { ...env, LINK_KEY: 'cd'.repeat(32) };
  assert.equal((await handleSubscription(new Request(base + path), rotated, assert.fail)).status, 404);
});

test('rejects upstream redirects and oversized bodies', async () => {
  const path = await generate();
  const request = new Request(base + path);
  const redirect = () => Response.redirect('https://other.example');
  const oversized = () => new Response(new Uint8Array(4 * 1024 * 1024 + 1));
  assert.equal((await handleSubscription(request, env, redirect)).status, 502);
  assert.equal((await handleSubscription(request, env, oversized)).status, 502);
});
