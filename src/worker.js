import { handleSubscription } from './subscriptions.js';

export default {
  async fetch(request, env) {
    return await handleSubscription(request, env) ?? env.ASSETS.fetch(request);
  },
};
