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
    const payload = options.payload || JSON.stringify({ id: 'evt_fixture', type, data: { object: { payment_intent: h.intent.id } } });
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
