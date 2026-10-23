/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { load } = require('./ui-harness.cjs');
const { refundHarness } = require('./refund-harness.cjs');
process.env.REFUND_CREATE_ENABLED = '1';
process.env.REFUND_WEBHOOK_ENABLED = '1';
process.env.STRIPE_REFUND_WEBHOOK_SECRET = 'fixture-only-webhook-secret';
function setup() {
  const h = refundHarness();
  const api = load('src/app/api/stripe/refund-webhook/route.ts', h.mocks);
  const send = (type = 'refund.updated', options = {}) => {
    const payload = options.payload || JSON.stringify({ id: 'evt_fixture', type, data: { object: { id: 're_fixture_1', object: 'refund', payment_intent: h.intent.id, ...options.object } } });
    const time = Math.floor(Date.now() / 1000) - (options.old ? 600 : 0);
    const signature = createHmac('sha256', process.env.STRIPE_REFUND_WEBHOOK_SECRET).update(`${time}.${payload}`).digest('hex');
    return api.POST(new Request('https://fixture.test/api/stripe/refund-webhook', { method: 'POST', headers: { 'stripe-signature': `t=${time},v1=${options.invalid ? 'bad' : signature}` }, body: payload }));
  };
  return Object.assign(h, { send });
}
test('refund webhook requires explicit enabling, a secret, signature and fresh timestamp', async () => {
  const h = setup();assert.equal((await h.send('refund.updated', { invalid: true })).status, 400);
  assert.equal((await h.send('refund.updated', { old: true })).status, 400);
  process.env.REFUND_WEBHOOK_ENABLED = '0';
  try { assert.equal((await h.send()).status, 503); } finally { process.env.REFUND_WEBHOOK_ENABLED = '1'; }
  assert.equal(h.calls.length, 0);assert.equal(h.rows.size, 0);
});
test('duplicate/out-of-order webhook reconciles only; no new refund, no sale mutation', async () => {
  const h = setup();h.pending = true;
  const row = await h.request();
  assert.equal(row.refund_state, "processing");
  h.stripeRefunds.get(row.stripe_refund_id).status = "succeeded";
  const before = structuredClone(h.order), posts = h.calls.filter(call => call[0] === 'POST').length;
  await h.send('refund.updated');await h.send('refund.created');await h.send('refund.failed');
  assert.equal(h.rows.get(h.order.id).refund_state, 'refunded');assert.equal(h.rows.get(h.order.id).stripe_refund_id, row.stripe_refund_id);
  assert.equal(h.calls.filter(call => call[0] === 'POST').length, posts);assert.deepEqual(h.order, before);
});
test('webhook without a durable request cannot create; malformed payload fails safely', async () => {
  const h = setup();assert.equal((await h.send()).status, 200);assert.equal(h.rows.size, 0);assert.equal(h.calls.length, 0);
  assert.equal((await h.send('refund.updated', { payload: '{bad JSON' })).status, 503);
  assert.equal((await h.send('payment_intent.succeeded')).status, 200);
});

for (const status of ['failed', 'canceled']) test(`webhook ${status} enters review; duplicate and late pending events cannot downgrade it`, async () => {
  const h = setup();h.pending = true;
  const row = await h.request(), refund = h.stripeRefunds.get(row.stripe_refund_id);
  refund.status = status;
  assert.equal((await h.send('refund.failed')).status, 200);
  assert.equal(h.rows.get(row.order_id).refund_state, 'requires_review');
  assert.equal(h.rows.get(row.order_id).refund_error, status === 'failed' ? 'REFUND_FAILED' : 'REFUND_CANCELED');
  refund.status = 'pending';
  await h.send('refund.created');await h.send('refund.updated');
  assert.equal(h.rows.get(row.order_id).refund_state, 'requires_review');
  assert.equal(h.calls.filter(c => c[0] === 'POST').length, 1);
});

test('webhook retries uncertain Stripe reads, ignores another refund and rejects malformed objects', async () => {
  const h = setup();h.pending = true;await h.request();
  h.failGet = true;assert.equal((await h.send()).status, 503);h.failGet = false;
  const before = h.calls.length;
  assert.equal((await (await h.send('refund.updated', { object: { id: 're_other' } })).json()).ignored, true);
  assert.equal(h.calls.length, before);
  assert.equal((await h.send('refund.updated', { object: { object: 'charge' } })).status, 400);
  assert.equal((await h.send('refund.updated', { object: { id: null } })).status, 400);
  assert.equal((await h.send('refund.updated', { object: { payment_intent: null } })).status, 400);
});

test('create acknowledgement succeeded still waits for webhook retrieval before final success', async () => {
  const h = setup();
  const row = await h.request();assert.equal(row.refund_state, 'processing');assert.equal(row.refunded_at, null);
  await h.send('refund.updated');
  const final = structuredClone(h.rows.get(row.order_id));
  assert.equal(final.refund_state, 'refunded');assert.ok(final.refunded_at);
  h.stripeRefunds.get(row.stripe_refund_id).status = 'failed';
  await h.send('refund.failed');await h.send('refund.created');
  assert.deepEqual(h.rows.get(row.order_id), final);
});
