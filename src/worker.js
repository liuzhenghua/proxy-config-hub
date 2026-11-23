import { handleConfig } from './configs.js';
import { handleSubscription } from './subscriptions.js';

export default {
  async fetch(request, env) {
    return await handleConfig(request, env) ??
      await handleSubscription(request, env) ??
      env.ASSETS.fetch(request);
  },
};
