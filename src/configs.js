import { configs } from '../public/config-catalog.js';

const catalogPaths = new Set(configs.flatMap(({ directory, files }) =>
  files.map(([name]) => '/config/' + directory + '/' + name),
));
const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'text/plain; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

export async function handleConfig(request, env, fetchGitHub = fetch) {
  const path = new URL(request.url).pathname;
  if (!catalogPaths.has(path) || !env.TECH_REPO_TOKEN) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
  }

  const file = path.slice('/config/'.length);
  const source = 'https://api.github.com/repos/liuzhenghua/tech/contents/infra/' + file + '?ref=main';
  try {
    const response = await fetchGitHub(source, {
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: 'Bearer ' + env.TECH_REPO_TOKEN,
        'User-Agent': 'proxy-config-hub',
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 200 && request.method === 'GET') {
      return new Response(response.body, { headers });
    }
    await response.body?.cancel();
    if (response.status === 200) return new Response(null, { headers });
  } catch {
    // GitHub errors are returned without request details or credentials.
  }
  return new Response(request.method === 'HEAD' ? null : '暂时无法从 tech 仓库读取配置', {
    status: 502, headers,
  });
}
