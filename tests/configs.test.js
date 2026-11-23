import assert from 'node:assert/strict';
import test from 'node:test';
import { configs } from '../public/config-catalog.js';
import { handleConfig } from '../src/configs.js';

const base = 'https://hub.example';
const env = { TECH_REPO_TOKEN: 'test-token' };
const fallback = '/config/openclash/proxy-whitelist-fallback.conf';

test('each catalog URL reads the corresponding current file in tech main', async () => {
  for (const { directory, files } of configs) {
    for (const [file] of files) {
      const request = new Request(base + '/config/' + directory + '/' + file);
      const response = await handleConfig(request, env, (url, options) => {
        assert.equal(url, 'https://api.github.com/repos/liuzhenghua/tech/contents/infra/' + directory + '/' + file + '?ref=main');
        assert.equal(options.headers.Authorization, 'Bearer test-token');
        assert.equal(options.cache, 'no-store');
        assert.equal(options.redirect, 'manual');
        return new Response('current content');
      });
      assert.equal(await response.text(), 'current content');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
});

test('uses fallback without a token and never requests files outside the catalog', async () => {
  assert.equal(await handleConfig(new Request(base + fallback), {}, assert.fail), null);
  assert.equal(await handleConfig(new Request(base + '/config/private.md'), env, assert.fail), null);
  assert.equal(await handleConfig(new Request(base + '/config/openclash/%2E%2E%2Fprivate.md'), env, assert.fail), null);
});

test('does not expose GitHub errors or follow redirects with the token', async () => {
  const request = new Request(base + fallback);
  for (const status of [302, 403, 404]) {
    const response = await handleConfig(request, env, () => new Response('private response', { status }));
    assert.equal(response.status, 502);
    assert.equal(await response.text(), '暂时无法从 tech 仓库读取配置');
  }
});
