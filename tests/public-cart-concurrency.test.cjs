/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');
const { cartLocks, installLocks } = require('./public-cart-locks.cjs');

const items = [{ id: 'meal', name: 'Meal', price: 10, qty: 1, unitNotes: ['mild'], redSauce: true, extraRedSauceQty: 1 }];
const row = { id: 'order-a', event_id: 'event-a', payment: 'card', status: 'DONE', paid_at: '2026-11-02T12:00:00Z',
  payment_provider: 'stripe', stripe_payment_intent_id: 'pi_a', amount_cents: 1000, currency: 'eur', items };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

// Pause a granted lock before running the production callback. The shared manager
// continues to receive requests, but cannot grant the next one until release.
function controlledLocks() {
  const manager = cartLocks();
  let next;
  return {
    pauseNext() {
      const entered = deferred(), release = deferred();
      next = { entered, release };
      return { entered: entered.promise, release: release.resolve };
    },
    request(name, options, callback) {
      assert.equal(name, 'af-public-cart-v1');
      assert.equal(options.mode, 'exclusive');
      const pause = next; next = null;
      return manager.request(name, options, async lock => {
        if (pause) { pause.entered.resolve(); await pause.release.promise; }
        return callback(lock);
      });
    },
  };
}

async function setup(t, locks = controlledLocks()) {
  installLocks(t, locks);
  const previous = { localStorage: global.localStorage, window: global.window };
  const storage = new Map(), writes = [];
  global.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); if (key === 'afrofood_cart_v1') writes.push(JSON.parse(value)); },
    removeItem: key => { storage.delete(key); if (key === 'afrofood_cart_v1') writes.push(null); },
  };
  global.window = { dispatchEvent() {} };
  t.after(() => Object.assign(global, previous));
  localStorage.setItem('af_event_id', row.event_id);
  // Independent module instances model two contexts sharing storage and locks.
  const a = load('src/lib/cart.ts'), b = load('src/lib/cart.ts'), paid = load('src/lib/paid-cart.ts');
  await a.replaceCart(items);
  const snapshot = await a.captureCartSnapshot();
  await paid.rememberCartOrder({ id: row.id, eventId: row.event_id, amountCents: 1000, payment: 'card' }, snapshot);
  writes.length = 0;
  return { a, b, paid, locks, writes, snapshot };
}

for (const identical of [false, true]) {
  const replacement = identical ? items : [{ ...items[0], qty: 2 }];
  test(`cleanup A owns lock, B waits and survives every subsequent write (identical=${identical})`, async t => {
    const { a, b, paid, locks, writes, snapshot } = await setup(t);
    const gate = locks.pauseNext();
    const cleanup = paid.clearConfirmedCart(row);
    await gate.entered;
    let finished = false;
    const writeB = b.replaceCart(replacement).then(() => { finished = true; });
    await Promise.resolve();
    assert.equal(finished, false);
    assert.deepEqual(writes, []);
    assert.equal(a.cartSnapshot().revision, snapshot.revision);
    gate.release();
    assert.equal(await cleanup, true);
    await writeB;
    const final = b.cartSnapshot();
    assert.notEqual(final.revision, snapshot.revision);
    assert.deepEqual(final.items.map(i => [i.id, i.qty, i.unitNotes, i.redSauce, i.extraRedSauceQty]),
      replacement.map(i => [i.id, i.qty, i.unitNotes.concat(Array(i.qty - 1).fill('')), i.redSauce, i.extraRedSauceQty]));
    assert.equal(await paid.clearConfirmedCart(row), false);
    assert.deepEqual(writes, [[], JSON.parse(JSON.stringify(replacement))]);
    assert.equal(b.cartSnapshot().fingerprint, final.fingerprint);
  });

  test(`B owns lock, cleanup A waits then preserves B (identical=${identical})`, async t => {
    const { b, paid, locks, writes, snapshot } = await setup(t);
    const gate = locks.pauseNext();
    const writeB = b.replaceCart(replacement);
    await gate.entered;
    let finished = false;
    const cleanup = paid.clearConfirmedCart(row).then(result => { finished = true; return result; });
    await Promise.resolve();
    assert.equal(finished, false);
    assert.deepEqual(writes, []);
    gate.release();
    await writeB;
    assert.equal(await cleanup, false);
    assert.notEqual(b.cartSnapshot().revision, snapshot.revision);
    assert.deepEqual(writes, [JSON.parse(JSON.stringify(replacement))]);
    assert.equal(b.getCart()[0].qty, replacement[0].qty);
    if (identical) assert.equal(b.cartSnapshot().fingerprint, snapshot.fingerprint);
  });
}

test('no contention: concurrent duplicate cleanup clears A exactly once', async t => {
  const { a, paid, writes } = await setup(t);
  assert.deepEqual(await Promise.all([paid.clearConfirmedCart(row), paid.clearConfirmedCart(row)]), [true, false]);
  assert.deepEqual(a.getCart(), []);
  assert.deepEqual(writes, [[]]);
});

test('B requested during the actual protected comparison cannot slip between comparison and clearing', async t => {
  const { b, paid, writes } = await setup(t);
  const getItem = localStorage.getItem;
  let writeB;
  localStorage.getItem = key => {
    const value = getItem(key);
    if (key === 'af_cart_revision_v1' && !writeB) {
      // cartSnapshot has read A's lines and is now reading its revision.
      // Request B from the other context precisely inside that comparison.
      writeB = b.replaceCart([{ ...items[0], qty: 2 }]);
      assert.deepEqual(writes, []);
    }
    return value;
  };
  assert.equal(await paid.clearConfirmedCart(row), true);
  assert.ok(writeB);
  await writeB;
  assert.deepEqual(writes.map(lines => lines.map(i => i.qty)), [[], [2]]);
  assert.equal(b.getCart()[0].qty, 2);
});

test('without Web Locks automatic cleanup refuses; all normal mutations remain usable', async t => {
  const { a, paid, writes } = await setup(t, undefined);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const before = a.cartSnapshot();
  assert.equal(await paid.clearConfirmedCart(row), false);
  assert.deepEqual(a.cartSnapshot(), before);
  assert.deepEqual(writes, []);
  await a.addToCart(items[0]); assert.equal(a.getCart()[0].qty, 2);
  await a.incrementItem('meal'); assert.equal(a.getCart()[0].qty, 3);
  await a.updateItemNote('meal', 'hot'); assert.equal(a.getCart()[0].unitNotes[0], 'hot');
  await a.updateItemUnitNote('meal', 1, 'mild'); assert.equal(a.getCart()[0].unitNotes[1], 'mild');
  await a.decrementItem('meal'); assert.equal(a.getCart()[0].qty, 2);
  await a.removeItem('meal'); assert.deepEqual(a.getCart(), []);
  await a.replaceCart(items); assert.equal(a.getCart().length, 1);
  assert.ok((await a.captureCartSnapshot()).revision);
  await a.clearCart(); assert.deepEqual(a.getCart(), []);
});

for (const [name, mutate] of [
  ['add', cart => cart.addToCart(items[0])],
  ['increment', cart => cart.incrementItem('meal')],
  ['decrement', cart => cart.decrementItem('meal')],
  ['note', cart => cart.updateItemNote('meal', 'hot')],
  ['unit note', cart => cart.updateItemUnitNote('meal', 0, 'hot')],
  ['remove', cart => cart.removeItem('meal')],
  ['clear', cart => cart.clearCart()],
  ['replace', cart => cart.replaceCart(items)],
  ['capture revision', cart => cart.captureCartSnapshot()],
]) test(`${name} waits for the shared cart lock`, async t => {
  const { b, locks, writes } = await setup(t);
  const gate = locks.pauseNext();
  const holder = b.withCartLock(() => {});
  await gate.entered;
  let finished = false;
  const mutation = mutate(b).then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false); assert.deepEqual(writes, []);
  gate.release(); await holder; await mutation;
  assert.equal(finished, true);
});

test('stale repricing cannot overwrite a newer revision with identical products', async t => {
  const { a, b, snapshot } = await setup(t);
  await b.replaceCart(items);
  assert.equal(await a.replaceCart([{ ...items[0], price: 99 }], snapshot), false);
  assert.equal(b.getCart()[0].price, 10);
});

const nextEvent = { id: 'event-b', name: 'Event B' };

for (const identical of [false, true]) {
  const replacement = identical ? items : [{ ...items[0], qty: 2 }];
  test(`event switch rejects B already committed since page observation (identical=${identical})`, async t => {
    const { a, b, writes } = await setup(t);
    localStorage.setItem('af_last_order_id', 'receipt-a');
    const expected = await a.captureCartEventSnapshot();
    await b.replaceCart(replacement);
    const before = b.cartSnapshot();
    assert.equal(await a.changeCartEvent(expected, nextEvent), 'conflict');
    assert.deepEqual(b.cartSnapshot(), before);
    assert.equal(localStorage.getItem('af_event_id'), 'event-a');
    assert.equal(localStorage.getItem('af_last_order_id'), 'receipt-a');
    assert.equal(writes.length, 1);
  });

  test(`B holds lock while event switch queues; conflict preserves B and receipt (identical=${identical})`, async t => {
    const { a, b, locks, writes } = await setup(t);
    localStorage.setItem('af_last_order_id', 'receipt-a');
    const expected = await a.captureCartEventSnapshot();
    const gate = locks.pauseNext();
    const writeB = b.replaceCart(replacement);
    await gate.entered;
    let finished = false;
    const switching = a.changeCartEvent(expected, nextEvent).then(result => { finished = true; return result; });
    await Promise.resolve();
    assert.equal(finished, false); assert.deepEqual(writes, []);
    gate.release(); await writeB;
    assert.equal(await switching, 'conflict');
    assert.equal(localStorage.getItem('af_event_id'), 'event-a');
    assert.equal(localStorage.getItem('af_last_order_id'), 'receipt-a');
    assert.notEqual(b.cartSnapshot().revision, expected.revision);
    assert.deepEqual(writes, [JSON.parse(JSON.stringify(replacement))]);
    if (identical) assert.equal(b.cartSnapshot().fingerprint, expected.fingerprint);
  });

  test(`event switch holds lock; B writes afterwards and survives (identical=${identical})`, async t => {
    const { a, b, locks, writes } = await setup(t);
    localStorage.setItem('af_last_order_id', 'receipt-a');
    const expected = await a.captureCartEventSnapshot();
    const gate = locks.pauseNext();
    const switching = a.changeCartEvent(expected, nextEvent);
    await gate.entered;
    let finished = false;
    const writeB = b.replaceCart(replacement).then(() => { finished = true; });
    await Promise.resolve();
    assert.equal(finished, false); assert.deepEqual(writes, []);
    gate.release();
    assert.equal(await switching, 'changed'); await writeB;
    assert.equal(localStorage.getItem('af_event_id'), nextEvent.id);
    assert.equal(localStorage.getItem('af_event_name'), nextEvent.name);
    assert.deepEqual(writes, [[], JSON.parse(JSON.stringify(replacement))]);
    assert.notEqual(b.cartSnapshot().revision, expected.revision);
  });
}

test('event switch commits event, empty cart and old receipt removal in one lock', async t => {
  const { a, b, writes } = await setup(t);
  localStorage.setItem('af_last_order_id', 'receipt-a');
  const expected = await a.captureCartEventSnapshot();
  assert.equal(await a.changeCartEvent(expected, nextEvent), 'changed');
  const observed = await b.captureCartEventSnapshot();
  assert.equal(observed.eventId, nextEvent.id); assert.equal(observed.eventName, nextEvent.name);
  assert.deepEqual(observed.items, []); assert.equal(observed.lastOrderId, null);
  assert.deepEqual(writes, [[]]);
});

test('B requested during event-switch comparison waits for the complete event transition', async t => {
  const { a, b, writes } = await setup(t);
  const expected = await a.captureCartEventSnapshot();
  const getItem = localStorage.getItem;
  let writeB;
  localStorage.getItem = key => {
    const value = getItem(key);
    if (key === 'af_cart_revision_v1' && !writeB) {
      writeB = b.replaceCart(items);
      assert.deepEqual(writes, []);
    }
    return value;
  };
  assert.equal(await a.changeCartEvent(expected, nextEvent), 'changed');
  assert.ok(writeB); await writeB;
  assert.deepEqual(writes, [[], JSON.parse(JSON.stringify(items))]);
  assert.equal(localStorage.getItem('af_event_id'), nextEvent.id);
  // An old payment response must not clear B or its new receipt reference.
  localStorage.setItem('af_last_order_id', 'receipt-b');
  const paid = load('src/lib/paid-cart.ts');
  assert.equal(await paid.clearConfirmedCart(row), false);
  assert.equal(localStorage.getItem('af_last_order_id'), 'receipt-b');
  assert.equal(b.getCart().length, 1);
});

test('initial event selection without Web Locks preserves existing basket and receipt', async t => {
  const { a, writes } = await setup(t);
  localStorage.removeItem('af_event_id');
  localStorage.setItem('af_last_order_id', 'receipt-a');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const expected = await a.captureCartEventSnapshot();
  assert.equal(await a.changeCartEvent(expected, nextEvent), 'changed');
  assert.deepEqual(a.cartSnapshot().items, expected.items);
  assert.equal(localStorage.getItem('af_last_order_id'), 'receipt-a');
  assert.deepEqual(writes, []);
});

for (const [key, value] of [['af_event_id', 'event-c'], ['af_event_name', 'Changed name'], ['af_last_order_id', 'receipt-b']]) {
  test(`event switch rejects a stale ${key} without modifying storage`, async t => {
    const { a, writes } = await setup(t);
    const expected = await a.captureCartEventSnapshot();
    localStorage.setItem(key, value);
    const before = await a.captureCartEventSnapshot();
    assert.equal(await a.changeCartEvent(expected, nextEvent), 'conflict');
    assert.deepEqual(await a.captureCartEventSnapshot(), before);
    assert.deepEqual(writes, []);
  });
}

test('same event preserves cart revision and receipt', async t => {
  const { a, writes } = await setup(t);
  localStorage.setItem('af_last_order_id', 'receipt-a');
  const expected = await a.captureCartEventSnapshot();
  assert.equal(await a.changeCartEvent(expected, { id: expected.eventId, name: 'Event A' }), 'changed');
  assert.equal(a.cartSnapshot().revision, expected.revision);
  assert.equal(localStorage.getItem('af_last_order_id'), 'receipt-a');
  assert.deepEqual(writes, []);
});

test('without Web Locks event switch refuses destruction; same-event navigation still works', async t => {
  const { a, writes } = await setup(t);
  localStorage.setItem('af_last_order_id', 'receipt-a');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const expected = await a.captureCartEventSnapshot();
  assert.equal(await a.changeCartEvent(expected, nextEvent), 'unavailable');
  assert.deepEqual(await a.captureCartEventSnapshot(), expected);
  assert.equal(await a.changeCartEvent(expected, { id: expected.eventId, name: 'Event A' }), 'changed');
  assert.deepEqual(writes, []);
});
