import { handleSubscription } from '../../src/subscriptions.js';

export function onRequest({ request, env }) {
  return handleSubscription(request, env);
}
