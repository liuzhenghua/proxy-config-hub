import { handleConfig } from '../../src/configs.js';

export async function onRequest({ request, env, next }) {
  return await handleConfig(request, env) ?? next();
}
