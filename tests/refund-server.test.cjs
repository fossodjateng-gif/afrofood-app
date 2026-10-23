/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const { refundHarness } = require('./refund-harness.cjs');
process.env.REFUND_CREATE_ENABLED = '1';

for (const role of ['cashier', 'admin']) test(`total refund authorized for ${role}; no sale/kitchen/quantity mutation`, async () => {
  const h = refundHarness(), before = structuredClone(h.order);
  const row = await h.request({ ...h.user, role });
  assert.equal(row.refund_state, 'processing');assert.equal(row.refund_amount_cents, 1250);assert.equal(row.requested_by, 'paul');assert.equal(row.refunded_at, null);
  assert.equal((await h.read()).refund_state, 'refunded');assert.ok(h.rows.get(h.order.id).refunded_at);
  assert.deepEqual(h.order, before);assert.equal(h.keys.size, 1);
  await h.request();assert.equal(h.keys.size, 1);
});

for (const role of ['kitchen', 'unknown']) test(`refund refuses ${role}`, async () => {
  const h = refundHarness();await assert.rejects(h.request({ ...h.user, role }), /forbidden/);assert.equal(h.calls.length, 0);
});
for (const patch of [{ active: false }, { cashierEventId: 'other' }]) test(`refund refuses actor ${JSON.stringify(patch)}`, async () => {
  const h = refundHarness();await assert.rejects(h.request({ ...h.user, ...patch }));assert.equal(h.calls.length, 0);
});

for (const patch of [
  { payment: 'cash' }, { payment: 'cashless' }, { payment_provider: null }, { status: 'PENDING_PAYMENT' }, { status: 'CANCELED' },
  { paid_at: null }, { stripe_payment_intent_id: null }, { amount_cents: 0 }, { amount_cents: -1 }, { currency: null }, { currency: 'usd' },
]) test(`ineligible sale ${JSON.stringify(patch)} never reaches Stripe`, async () => {
  const h = refundHarness();Object.assign(h.order, patch);await assert.rejects(h.request());assert.equal(h.calls.length, 0);assert.equal(h.rows.size, 0);
});

for (const patch of [
  { id: 'pi_wrong' }, { status: 'processing' }, { metadata: {} }, { metadata: { order_id: 'other' } },
  { amount: 1 }, { amount_received: 1 }, { amount_received: null }, { currency: 'usd' },
]) test(`Stripe payment mismatch ${JSON.stringify(patch)} requires review without create`, async () => {
  const h = refundHarness();Object.assign(h.intent, patch);const row = await h.request();assert.equal(row.refund_state, 'requires_review');assert.equal(h.keys.size, 0);
});

test('double click / two cashiers / reload / retry share one durable operation and first actor', async () => {
  const h = refundHarness(), marie = { ...h.user, id: 'marie', username: 'marie' };
  const result = await Promise.all([h.request(), h.request(marie), h.request()]);
  assert.equal(h.rows.size, 1);assert.equal(h.keys.size, 1);assert.equal(h.rows.get(h.order.id).requested_by, 'paul');
  assert.ok(result.every(row => row.refund_key === result[0].refund_key));
  const postKeys = h.calls.filter(call => call[0] === 'POST').map(call => call[3]);assert.equal(new Set(postKeys).size, 1);
  assert.equal((await h.read()).refund_state, 'refunded');
  assert.equal((await h.request(marie)).requested_by, 'paul');
});

test('GET never claims or creates; POST disabled by default remains a durable request', async () => {
  const h = refundHarness();assert.equal(await h.read(), undefined);assert.equal(h.rows.size, 0);assert.equal(h.calls.length, 0);
  process.env.REFUND_CREATE_ENABLED = '0';
  try { assert.equal((await h.request()).refund_state, 'requested');assert.equal(h.keys.size, 0); }
  finally { process.env.REFUND_CREATE_ENABLED = '1'; }
});

test('timeout before Stripe leaves the same durable key for retry', async () => {
  const h = refundHarness();h.failGet = true;
  const first = await h.request();assert.equal(first.refund_state, 'requested');assert.equal(h.keys.size, 0);
  h.failGet = false;const second = await h.request();assert.equal(second.refund_key, first.refund_key);assert.equal(second.refund_state, 'processing');
});
test('lost response after Stripe success is reconciled without a second POST', async () => {
  const h = refundHarness();h.loseCreate = true;
  const first = await h.request();assert.equal(first.refund_state, 'requested');assert.equal(h.keys.size, 1);
  const result = await h.request();assert.equal(result.refund_state, 'refunded');assert.equal(h.calls.filter(call => call[0] === 'POST').length, 1);
});
test('Stripe success followed by DB persistence failure is recovered from existing refund', async () => {
  const h = refundHarness();h.failSave = true;
  await assert.rejects(h.request(), /DB commit/);assert.equal(h.keys.size, 1);
  assert.equal((await h.request()).refund_state, 'refunded');assert.equal(h.calls.filter(call => call[0] === 'POST').length, 1);
});
test('pending Refund is retrieved by ID until success; GET never creates', async () => {
  const h = refundHarness();h.pending = true;
  const row = await h.request();assert.equal(row.refund_state, 'processing');
  h.stripeRefunds.get(row.stripe_refund_id).status = 'succeeded';
  assert.equal((await h.read()).refund_state, 'refunded');assert.equal(h.keys.size, 1);
});

for (const kind of ['external', 'partial', 'multiple', 'wrong-metadata', 'unknown-status', 'wrong-currency']) test(`existing Stripe refund ${kind}`, async () => {
  const h = refundHarness();
  const refund = { id: 're_external', payment_intent: h.intent.id, amount: 1250, currency: 'eur', status: 'succeeded', metadata: {} };
  if (kind === 'partial') refund.amount = 500;
  if (kind === 'wrong-metadata') refund.metadata = { order_id: 'other' };
  if (kind === 'unknown-status') refund.status = 'unknown';
  if (kind === 'wrong-currency') refund.currency = 'usd';
  h.stripeRefunds.set(refund.id, refund);
  if (kind === 'multiple') h.stripeRefunds.set('re_other', { ...refund, id: 're_other' });
  const row = await h.request();assert.equal(row.refund_state, kind === 'external' ? 'refunded' : 'requires_review');assert.equal(h.keys.size, 0);
});

test('listing consumes pagination before deciding; malformed/incomplete pages never create', async () => {
  const h = refundHarness();let pages = 0;
  h.pages = params => { pages++;return params.has('starting_after') ? { data: [{ id: 're_second' }], has_more: false } : { data: [{ id: 're_first' }], has_more: true }; };
  assert.equal((await h.request()).refund_state, 'requires_review');assert.equal(pages, 2);assert.equal(h.keys.size, 0);
  const invalid = refundHarness();invalid.pages = () => ({ data: null, has_more: true });
  assert.equal((await invalid.request()).refund_state, 'requested');assert.equal(invalid.keys.size, 0);
});
test('empty list outside replay window never causes a new refund', async () => {
  const h = refundHarness();h.failGet = true;await h.request();h.failGet = false;
  h.rows.get(h.order.id).refund_requested_at = '2000-01-01T00:00:00Z';
  assert.equal((await h.request()).refund_state, 'requires_review');assert.equal(h.keys.size, 0);
});
for (const patch of [{ status: 'unknown' }, { amount: 1 }, { metadata: {} }, { payment_intent: 'other' }, { id: null }, { id: {} }, { metadata: [] }]) test(`invalid creation response ${JSON.stringify(patch)} never reports success`, async () => {
  const h = refundHarness();h.responsePatch = patch;assert.equal((await h.request()).refund_state, 'requires_review');
});
test('financial service has no dependency on sale finalization, quantities, Terminal or printing', () => {
  const source = fs.readFileSync('src/lib/refund-server.ts', 'utf8');
  assert.doesNotMatch(source, /finalizeSale|reconcileCardPayment|cancelCardPayment|publishOrderEvent|window\.print|UPDATE orders|app_settings|terminal-active/);
});

for (const amount of [1251, 999999999, 500, -1, 1.5, '1250', null]) test(`full Refund V1 refuses invalid requested amount ${JSON.stringify(amount)}`, async () => {
  const h = refundHarness();
  await assert.rejects(h.request(h.user, amount), /refund_invalid_amount/);
  assert.equal(h.rows.size, 0);assert.equal(h.calls.length, 0);
});

test('create success is processing until independently retrieved; audit and payer remain distinct', async () => {
  const h = refundHarness();
  Object.assign(h.order, { paid_by: 'marie', paid_by_username: 'Marie', paid_register_id: 'other-register', paid_register_name: 'Caisse 2' });
  const before = structuredClone(h.order);
  const row = await h.request();
  assert.equal(row.refund_state, 'processing');assert.equal(row.refunded_at, null);
  assert.deepEqual([row.requested_by, row.requested_by_username, row.requested_event_id, row.requested_register_id, row.requested_register_name], ['paul', 'paul', 'event-x', h.user.workstationId, 'Caisse 1']);
  h.user.username = 'renamed';h.user.workstationName = 'Renamed register';
  const retry = await h.request();
  assert.equal(retry.refund_state, 'refunded');assert.equal(retry.requested_by_username, 'paul');assert.equal(retry.requested_register_name, 'Caisse 1');
  assert.deepEqual(h.order, before);assert.equal(h.calls.filter(c => c[0] === 'POST').length, 1);
});

test('revoked lease rejects the transaction before the durable refund claim', async () => {
  const h = refundHarness();h.guardError = true;
  await assert.rejects(h.request(), /lease revoked/);
  assert.equal(h.rows.size, 0);assert.equal(h.calls.length, 0);
});

for (const patch of [{ workstationId: null }, { workstationType: 'kitchen' }, { role: 'admin', cashierEventId: 'other' }]) test(`refund rejects incompatible server assignment ${JSON.stringify(patch)}`, async () => {
  const h = refundHarness();await assert.rejects(h.request({ ...h.user, ...patch }), /forbidden/);
  assert.equal(h.calls.length, 0);assert.equal(h.rows.size, 0);
});

for (const status of ['failed', 'canceled', 'requires_action']) test(`retrieved refund ${status} blocks automatic recreation`, async () => {
  const h = refundHarness();h.pending = true;
  const row = await h.request();h.stripeRefunds.get(row.stripe_refund_id).status = status;
  assert.equal((await h.read()).refund_state, 'requires_review');
  assert.equal((await h.request()).refund_state, 'requires_review');
  assert.equal(h.calls.filter(c => c[0] === 'POST').length, 1);
});

test('stale pending response cannot erase a concurrently recorded failure or confirmed success', async () => {
  const h = refundHarness();h.pending = true;const row = await h.request();
  const original = h.stripe.stripeGet;
  h.stripe.stripeGet = async path => {
    const refund = await original(path);
    if (path.startsWith('/refunds/')) Object.assign(h.rows.get(row.order_id), { refund_state: 'requires_review', refund_error: 'REFUND_FAILED' });
    return refund;
  };
  assert.equal((await h.read()).refund_state, 'requires_review');assert.equal(h.rows.get(row.order_id).refund_error, 'REFUND_FAILED');
  Object.assign(h.rows.get(row.order_id), { refund_state: 'refunded', refunded_at: new Date().toISOString() });
  assert.equal((await h.read()).refund_state, 'refunded');
});
