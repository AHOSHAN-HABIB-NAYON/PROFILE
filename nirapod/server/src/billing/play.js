// Google Play Billing server-side verification (Play Developer API v3). Purchases are trusted only after this
// check; the purchase token is stored as a hash. RTDN (Pub/Sub push) re-checks the subscription on every event.
import { serviceAccountAuth, defaultHttp } from '../google/service-account.js';

const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

export function createPlayVerifier({ db, cfg, clock, transport = defaultHttp }) {
  const auth = serviceAccountAuth({ db, cfg, clock, secretKey: 'play_service_account', scope: 'https://www.googleapis.com/auth/androidpublisher', transport });
  const pkg = cfg.GOOGLE_PLAY_PACKAGE_NAME;

  async function call(method, path, body) {
    const tok = await auth.token();
    if (!tok) return { status: 503, json: { error: 'not_configured' } };
    return transport(`${BASE}/${pkg}${path}`, {
      method,
      headers: { authorization: `Bearer ${tok.access}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  return {
    configured: async () => (await auth.account()) != null,
    /**
     * @returns {{ok: boolean, kind, productId, expiresAt?, autoRenew?, state, orderId?, acknowledged, linkedToken?}}
     */
    async verifySubscription(token) {
      const r = await call('GET', `/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`);
      if (r.status !== 200) return { ok: false, status: r.status };
      const j = r.json || {};
      const line = (j.lineItems || [])[0] || {};
      const state = j.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED';
      return {
        ok: true, kind: 'subscription', productId: line.productId, state,
        expiresAt: line.expiryTime ? new Date(line.expiryTime) : null,
        autoRenew: line.autoRenewingPlan?.autoRenewEnabled === true,
        orderId: j.latestOrderId ?? null,
        acknowledged: j.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        linkedToken: j.linkedPurchaseToken ?? null,
        test: !!j.testPurchase,
      };
    },
    async verifyProduct(productId, token) {
      const r = await call('GET', `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`);
      if (r.status !== 200) return { ok: false, status: r.status };
      const j = r.json || {};
      return { ok: true, kind: 'product', productId, state: j.purchaseState === 0 ? 'PURCHASED' : 'NOT_PURCHASED', orderId: j.orderId ?? null, acknowledged: j.acknowledgementState === 1 };
    },
    async acknowledge(kind, productId, token) {
      const path = kind === 'subscription'
        ? `/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`
        : `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`;
      const r = await call('POST', path, {});
      return r.status === 200 || r.status === 204;
    },
  };
}

/** Play subscription state -> our subscription status. */
export function statusFromPlay(state) {
  return {
    SUBSCRIPTION_STATE_ACTIVE: 'active',
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
    SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
    SUBSCRIPTION_STATE_PAUSED: 'paused',
    SUBSCRIPTION_STATE_CANCELED: 'cancelled', // still valid until expiry
    SUBSCRIPTION_STATE_EXPIRED: 'expired',
    SUBSCRIPTION_STATE_PENDING: 'on_hold',
  }[state] || 'expired';
}
