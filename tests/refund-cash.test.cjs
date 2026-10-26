/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { refundHarness } = require('./refund-harness.cjs');
process.env.REFUND_CREATE_ENABLED = '1';
function cashHarness() {
  const h = refundHarness();
  Object.assign(h.order, { payment: 'cash', payment_provider: null, stripe_payment_intent_id: null,
    amount_cents: 100, cash_received_cents: 200, change_given_cents: 100,
    items: [{ id: 'dip-chili', name: 'Chili sauce (hot)', qty: 2, price: 1, pricingKind: 'dip' }] });
  return h;
}
test('cash total is immediately recorded, attributed and read without any Stripe call or sale mutation', async () => {
  const h = cashHarness(), before = structuredClone(h.order);
  assert.equal(await h.read(), undefined);
  const row = await h.request(h.user, 100);
  assert.equal(row.payment_method, 'cash');assert.equal(row.refund_state, 'refunded');assert.equal(row.refund_amount_cents, 100);
  assert.ok(row.refunded_at);assert.ok(row.refund_requested_at);assert.equal(row.stripe_payment_intent_id, null);assert.equal(row.stripe_refund_id, null);
  assert.equal(row.requested_by, h.user.id);assert.equal(row.requested_by_username, h.user.username);
  assert.equal(row.requested_event_id, h.user.cashierEventId);assert.equal(row.requested_register_id, h.user.workstationId);
  assert.equal(row.requested_register_name, h.user.workstationName);
  assert.deepEqual(await h.read(), row);assert.deepEqual(h.order, before);assert.deepEqual(h.calls, []);
});
test('concurrent cashiers, double click and lost response all preserve one refund and first attribution', async () => {
  const h = cashHarness(), other = { ...h.user, id: 'marie', username: 'marie' };
  const result = await Promise.all([h.request(), h.request(other), h.request()]);
  assert.equal(h.rows.size, 1);assert.equal(new Set(result.map(r => r.refund_key)).size, 1);
  const initial = structuredClone(result[0]);
  assert.deepEqual(await h.request(other), initial);assert.deepEqual(await h.read(), initial);
  assert.equal(initial.requested_by, h.user.id);assert.deepEqual(h.calls, []);
});
for (const amount of [0, 50, 99, 101, -100, 1.5, '100', null]) test(`cash rejects non-total amount ${JSON.stringify(amount)}`, async () => {
  const h = cashHarness();await assert.rejects(h.request(h.user, amount), /refund_invalid_amount/);
  assert.equal(h.rows.size, 0);assert.deepEqual(h.calls, []);
});
for (const patch of [{ role: 'kitchen' }, { active: false }, { cashierEventId: 'other' }, { workstationId: null }, { workstationType: 'kitchen' }]) test(`cash refuses unauthorized context ${JSON.stringify(patch)}`, async () => {
  const h = cashHarness();await assert.rejects(h.request({ ...h.user, ...patch }));assert.equal(h.rows.size, 0);assert.deepEqual(h.calls, []);
});
test('cash refuses mismatched write context and revoked V3 lease before recording', async () => {
  const h = cashHarness();
  await assert.rejects(h.service.getOrderRefund(h.order.id, h.user, true, { ...h.context(h.user), eventId: 'other' }), /forbidden/);
  h.guardError = true;await assert.rejects(h.request(), /lease revoked/);
  assert.equal(h.rows.size, 0);assert.deepEqual(h.calls, []);
});
for (const patch of [{ paid_at: null }, { status: 'PENDING_PAYMENT' }, { status: 'CANCELED' }, { amount_cents: 0 }, { currency: 'usd' }, { stripe_payment_intent_id: 'pi_wrong' }, { payment_provider: 'stripe' }]) test(`cash rejects ineligible sale ${JSON.stringify(patch)}`, async () => {
  const h = cashHarness();Object.assign(h.order, patch);await assert.rejects(h.request());assert.equal(h.rows.size, 0);assert.deepEqual(h.calls, []);
});
test('cash respects the existing creation flag and a DB failure never reports success', async () => {
  const h = cashHarness();process.env.REFUND_CREATE_ENABLED = '0';
  try { await assert.rejects(h.request(), /refund_creation_disabled/);assert.equal(h.rows.size, 0); }
  finally { process.env.REFUND_CREATE_ENABLED = '1'; }
  h.failSave = true;await assert.rejects(h.request(), /DB commit failure/);assert.equal(h.rows.size, 0);
  assert.equal((await h.request()).refund_state, 'refunded');assert.deepEqual(h.calls, []);
});
test('inconsistent existing cash refund fails closed without calling Stripe', async () => {
  const h = cashHarness();const row = await h.request();h.rows.get(row.order_id).refund_amount_cents = 50;
  await assert.rejects(h.request(), /refund_payment_mismatch/);assert.deepEqual(h.calls, []);
});
