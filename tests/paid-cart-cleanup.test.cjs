/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');
const { installLocks } = require('./public-cart-locks.cjs');

function environment(t) {
  const old = Object.fromEntries(['localStorage', 'window'].map(k => [k, global[k]]));
  installLocks(t);
  const values = new Map();
  global.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  global.window = { dispatchEvent() {} };
  t.after(() => Object.assign(global, old));
  localStorage.setItem('af_event_id', 'event-a');
  return values;
}
const items = [{ id: 'meal', name: 'Meal', price: 10, qty: 1 }];
const row = { id: 'order-a', event_id: 'event-a', payment: 'card', status: 'DONE', paid_at: '2026-11-02T12:00:00Z',
  payment_provider: 'stripe', stripe_payment_intent_id: 'pi_a', amount_cents: 1000, currency: 'eur', items };

for (const payment of ['card', 'cash', 'cashless']) test(`public ${payment}: confirmed order clears only its basket and preserves receipt ID; repeated cleanup is harmless`, async t => {
  environment(t);
  const cart = load('src/lib/cart.ts'), paid = load('src/lib/paid-cart.ts');
  await cart.replaceCart(items);
  const submitted = cart.cartSnapshot();
  await paid.rememberCartOrder({ id: row.id, eventId: row.event_id, amountCents: 1000, payment }, submitted);
  localStorage.setItem('af_last_order_id', row.id);
  assert.equal(await paid.clearConfirmedCart({ ...row, payment }), true);
  assert.deepEqual(cart.getCart(), []);
  assert.equal(localStorage.getItem('af_last_order_id'), row.id);
  assert.equal(await paid.clearConfirmedCart({ ...row, payment }), false);
});

for (const patch of [{ status: 'PENDING_PAYMENT' }, { status: 'FAILED' }, { status: 'CANCELED' }, { paid_at: null }, { payment_provider: null },
  { stripe_payment_intent_id: null }, { event_id: 'other' }, { id: 'other' }, { amount_cents: 999 }, { currency: 'usd' }]) {
  test(`public unconfirmed/mismatched response preserves basket: ${JSON.stringify(patch)}`, async t => {
    environment(t); const cart = load('src/lib/cart.ts'), paid = load('src/lib/paid-cart.ts');
    await cart.replaceCart(items); await paid.rememberCartOrder({ id: row.id, eventId: row.event_id, amountCents: 1000, payment: 'card' }, cart.cartSnapshot());
    const before = localStorage.getItem(cart.CART_KEY);
    assert.equal(await paid.clearConfirmedCart({ ...row, ...patch }), false);
    assert.equal(localStorage.getItem(cart.CART_KEY), before);
  });
}

test('public late A confirmation preserves B, including a new basket with identical products', async t => {
  environment(t); const cart = load('src/lib/cart.ts'), paid = load('src/lib/paid-cart.ts');
  for (const replacement of [[{ ...items[0], qty: 2 }], items]) {
    await cart.replaceCart(items); await paid.rememberCartOrder({ id: row.id, eventId: row.event_id, amountCents: 1000, payment: 'card' }, cart.cartSnapshot());
    await cart.clearCart(); await cart.replaceCart(replacement);
    assert.equal(await paid.clearConfirmedCart(row), false);
    assert.deepEqual(cart.getCart().map(i => [i.id, i.qty]), replacement.map(i => [i.id, i.qty]));
  }
});

test('public reload reconciliation uses only GET; offline/error/wrong response never clears', async t => {
  environment(t); const cart = load('src/lib/cart.ts'), paid = load('src/lib/paid-cart.ts');
  await cart.replaceCart(items); await paid.rememberCartOrder({ id: row.id, eventId: row.event_id, amountCents: 1000, payment: 'card' }, cart.cartSnapshot());
  for (const request of [async () => { throw Error('offline'); }, async () => Response.json([row], { status: 500 }), async () => Response.json([{ ...row, id: 'other' }])]) {
    await paid.reconcilePaidCart(request); assert.equal(cart.getCart().length, 1);
  }
  const reloaded = load('src/lib/paid-cart.ts');
  await reloaded.reconcilePaidCart(async (url, init) => { assert.equal(url, '/api/orders?id=order-a'); assert.equal(init.method, undefined); return Response.json([row]); });
  assert.deepEqual(cart.getCart(), []);
});

function posFixture() {
  const pos = load('src/lib/pos-cart.ts'), card = load('src/lib/pos-card.ts'), paid = load('src/lib/pos-paid-cart.ts');
  const attempt = { key: 'attempt-a', fingerprint: 'fingerprint', userId: 'user-a', username: 'cashier', workstationId: 'station-a',
    eventId: 'event-a', orderId: row.id, amountCents: 1000, paymentIntentId: 'pi_a', items };
  const key = pos.posCartKey(attempt.userId, attempt.eventId, attempt.workstationId);
  pos.writePosCart(key, items); localStorage.setItem(card.cardAttemptKey(key), JSON.stringify(attempt));
  return { pos, card, paid, attempt, key };
}
test('POS cleanup removes draft and attempt, retains only server receipt reference; idempotent and cannot erase the next draft', t => {
  environment(t); const { pos, card, paid, attempt, key } = posFixture();
  assert.equal(paid.clearPaidPosCard(attempt, row, attempt), true);
  assert.equal(localStorage.getItem(key), null);
  assert.equal(localStorage.getItem(card.cardAttemptKey(key)), null);
  assert.equal(paid.readPaidCard(key).orderId, row.id);
  assert.equal(paid.readPaidCard(key).items, undefined);
  pos.writePosCart(key, items);
  assert.equal(paid.clearPaidPosCard(attempt, row, attempt), true);
  assert.equal(pos.readPosCart(key).length, 1);
});
for (const patch of [{ status: 'PENDING_PAYMENT' }, { status: 'CANCELED' }, { paid_at: null }, { event_id: 'other' }, { id: 'other' }]) {
  test(`POS no cleanup without exact paid order: ${JSON.stringify(patch)}`, t => {
    const values = environment(t); const { paid, attempt } = posFixture(); const before = [...values];
    assert.equal(paid.clearPaidPosCard(attempt, { ...row, ...patch }, attempt), false); assert.deepEqual([...values], before);
  });
}
for (const patch of [{ userId: 'other' }, { eventId: 'other' }, { workstationId: 'other' }]) {
  test(`POS context mismatch does not modify storage: ${JSON.stringify(patch)}`, t => {
    const values = environment(t); const { paid, attempt } = posFixture(); const before = [...values];
    assert.equal(paid.clearPaidPosCard(attempt, row, { ...attempt, ...patch }), false); assert.deepEqual([...values], before);
  });
}
test('POS stale attempt cannot remove another attempt or new draft', t => {
  environment(t); const { pos, card, paid, attempt, key } = posFixture();
  localStorage.setItem(card.cardAttemptKey(key), JSON.stringify({ ...attempt, key: 'attempt-b' }));
  assert.equal(paid.clearPaidPosCard(attempt, row, attempt), false);
  assert.equal(pos.readPosCart(key).length, 1);
});
