/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, load, findAll } = require('./ui-harness.cjs');
const { installLocks } = require('./public-cart-locks.cjs');
const component = (tree, name) => findAll(tree, node => node.type?.name === name)[0];
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
const items = [{ id: 'meal', name: 'Server meal', price: 10, qty: 1 }];
const paidOrder = { id: 'order-a', created_at: '2026-11-02T12:00:00Z', event_id: 'event-a', payment: 'card', status: 'DONE',
  paid_at: '2026-11-02T12:00:01Z', amount_cents: 1000, currency: 'eur', payment_provider: 'stripe', stripe_payment_intent_id: 'pi_a', items };

function setup(t) {
  installLocks(t);
  const originals = Object.fromEntries(['localStorage', 'window', 'document', 'fetch'].map(k => [k, global[k]]));
  const storage = new Map(), events = new Map(), docEvents = new Map(), intervals = [];
  global.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  const listen = map => (name, fn) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); };
  const remove = map => (name, fn) => map.get(name)?.delete(fn);
  global.window = { location: { href: '' }, addEventListener: listen(events), removeEventListener: remove(events), dispatchEvent: e => events.get(e.type)?.forEach(fn => fn(e)),
    setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval() {}, print() {} };
  global.document = { visibilityState: 'visible', addEventListener: listen(docEvents), removeEventListener: remove(docEvents) };
  localStorage.setItem('af_event_id', 'event-a');
  t.after(() => Object.assign(global, originals));
  return { storage, events, docEvents, intervals };
}

for (const trigger of ['mount', 'pageshow', 'visibilitychange']) test(`public ${trigger}: paid basket clears, React updates, server receipt survives and reloads`, async t => {
  const env = setup(t), cart = load('src/lib/cart.ts'), paid = load('src/lib/paid-cart.ts');
  await cart.replaceCart(items); await paid.rememberCartOrder({ id: paidOrder.id, eventId: 'event-a', payment: 'card', amountCents: 1000 }, cart.cartSnapshot());
  localStorage.setItem('af_last_order_id', paidOrder.id);
  let confirmed = trigger === 'mount';
  global.fetch = async url => { assert.equal(url, '/api/orders?id=order-a'); return Response.json([{ ...paidOrder, ...(confirmed ? {} : { status: 'PENDING_PAYMENT', paid_at: null }) }]); };
  const h = harness('src/app/cart/page.tsx', {}, { '@/lib/order-sync': { subscribeOrderSync: () => () => {} } });
  h.render();
  // Exercise the real mount/pageshow/visibility effect without menu-config requests.
  h.effects.find(fn => fn.toString().includes('pageshow'))(); await settle();
  if (!confirmed) {
    assert.equal(cart.getCart().length, 1); confirmed = true;
    for (const fn of (trigger === 'pageshow' ? env.events : env.docEvents).get(trigger)) fn({ type: trigger, persisted: true });
    await settle();
  }
  assert.deepEqual(h.state.cart, []); assert.deepEqual(cart.getCart(), []);
  let control = component(h.render(), 'OnDemandOrderReceipt');
  assert.equal(control.props.order.id, paidOrder.id); assert.deepEqual(control.props.order.items, items);
  assert.equal(h.state.orderStatus, 'DONE'); assert.equal(localStorage.getItem('af_last_order_id'), paidOrder.id);
  const reloaded = harness('src/app/cart/page.tsx'); reloaded.render();
  reloaded.effects.find(fn => fn.toString().includes('pageshow'))(); await settle();
  control = component(reloaded.render(), 'OnDemandOrderReceipt'); assert.equal(control.props.order.id, paidOrder.id);
});

test('menu return reconciles paid basket and counter; other-tab storage synchronizes counter', async t => {
  const env = setup(t), cart = load('src/lib/cart.ts'), paid = load('src/lib/paid-cart.ts');
  await cart.replaceCart(items); await paid.rememberCartOrder({ id: paidOrder.id, eventId: 'event-a', payment: 'card', amountCents: 1000 }, cart.cartSnapshot());
  global.fetch = async () => Response.json([paidOrder]);
  const h = harness('src/app/menu/page.tsx'); h.render();
  h.effects.find(fn => fn.toString().includes('reconcilePaidCart'))(); await settle();
  assert.equal(h.state.cartCount, 0); assert.deepEqual(cart.getCart(), []);
  localStorage.setItem(cart.CART_KEY, JSON.stringify([{ ...items[0], qty: 3 }]));
  env.events.get('storage').forEach(fn => fn({ key: cart.CART_KEY })); assert.equal(h.state.cartCount, 3);
});

test('menu add waits for the cart write before updating its counter', async t => {
  setup(t); const cart = load('src/lib/cart.ts');
  let release, entered;
  const acquired = new Promise(resolve => { entered = resolve; });
  const held = cart.withCartLock(() => new Promise(resolve => { release = resolve; entered(); }));
  await acquired;
  const h = harness('src/app/menu/page.tsx');
  const tree = h.render();
  const add = findAll(tree, n => n.type === 'button' && n.props.onClick?.toString().includes('addToCart'))[0];
  const click = add.props.onClick();
  await settle();
  assert.equal(h.state.cartCount, 0); assert.deepEqual(cart.getCart(), []);
  release(); await held; await click;
  assert.equal(h.state.cartCount, 1); assert.equal(cart.getCart()[0].qty, 1);
});

test('cart quantity click waits for the cart write before refreshing React state', async t => {
  setup(t); const cart = load('src/lib/cart.ts');
  await cart.replaceCart(items);
  let release, entered;
  const acquired = new Promise(resolve => { entered = resolve; });
  const held = cart.withCartLock(() => new Promise(resolve => { release = resolve; entered(); }));
  await acquired;
  const h = harness('src/app/cart/page.tsx', { cart: cart.getCart() });
  const tree = h.render();
  const increment = findAll(tree, n => n.type === 'button' && n.props.onClick?.toString().includes('incrementItem'))[0];
  const click = increment.props.onClick();
  await settle();
  assert.equal(h.state.cart[0].qty, 1);
  release(); await held; await click;
  assert.equal(h.state.cart[0].qty, 2); assert.equal(cart.getCart()[0].qty, 2);
});

test('manual resumed paid attempt clears draft/attempt, keeps printable server receipt, Back is empty, refresh reloads receipt', async t => {
  const env = setup(t), pos = load('src/lib/pos-cart.ts'), card = load('src/lib/pos-card.ts'), paid = load('src/lib/pos-paid-cart.ts');
  const session = { userId: 'user-a', username: 'cashier', role: 'cashier', cashierEventId: 'event-a', workstationId: 'station-a', workstationType: 'cashier' };
  const attempt = { key: 'attempt-a', fingerprint: 'fp', userId: session.userId, username: session.username, role: session.role, eventId: 'event-a', workstationId: 'station-a',
    orderId: paidOrder.id, amountCents: 1000, paymentIntentId: 'pi_a', items, published: true, createdAt: Date.now() };
  const key = pos.posCartKey(session.userId, 'event-a', 'station-a');
  pos.writePosCart(key, items); localStorage.setItem(card.cardAttemptKey(key), JSON.stringify(attempt));
  let prints = 0, offline = false, row = { ...paidOrder, status: 'PENDING_PAYMENT', paid_at: null }; window.print = () => prints++;
  const requests = [];
  global.fetch = async (url, init) => {
    requests.push([url, init?.method || 'GET']);
    assert.equal(init?.method || 'GET', 'GET');
    if (url.startsWith('/api/admin/menu-config')) return Response.json({ ok: true, storeConfig: { events: [{ id: 'event-a', name: 'Event A' }] }, sections: [{ id: 'food', items: [{ id: 'meal', name: { de: 'Meal' }, price: 10, visible: true }] }] });
    if (offline) throw Error('Verification unavailable');
    return Response.json([row]);
  };
  const mocks = { '@/lib/temporary-cashier-client': { getCashierSession: () => session, cashierFetch: (...args) => fetch(...args) },
    '@/lib/translations': { getSavedLang: () => 'fr', saveLang() {} } };
  const h = harness('src/app/caisse/manual/page.tsx', {}, mocks);
  h.render(); h.effects[0](); await settle(); h.render();
  h.effects.find(fn => fn.toString().includes('verifyCard'))(); await settle();
  assert.equal(pos.readPosCart(key).length, 1); assert.ok(localStorage.getItem(card.cardAttemptKey(key)));
  for (const status of ['PENDING_PAYMENT', 'CANCELED']) {
    row = { ...paidOrder, status, paid_at: null };
    env.intervals.at(-1)(); await settle();
    assert.equal(pos.readPosCart(key).length, 1); assert.ok(localStorage.getItem(card.cardAttemptKey(key)));
  }
  offline = true; env.intervals.at(-1)(); await settle(); offline = false;
  assert.equal(pos.readPosCart(key).length, 1); assert.ok(localStorage.getItem(card.cardAttemptKey(key)));
  row = paidOrder;
  env.intervals.at(-1)(); await settle();
  assert.deepEqual(h.state.items, []); assert.equal(localStorage.getItem(key), null); assert.equal(localStorage.getItem(card.cardAttemptKey(key)), null);
  assert.equal(paid.readPaidCard(key).orderId, paidOrder.id);
  let tree = h.render(), panel = component(tree, 'CardPayment'); assert.ok(panel); assert.equal(panel.props.attempt, null);
  assert.deepEqual(panel.props.receipt.items, items);
  panel.props.onTicket(); tree = h.render(); const receipt = component(tree, 'OrderReceipt');
  assert.equal(receipt.props.order.id, paidOrder.id); receipt.props.onPrint(); assert.equal(prints, 1);
  component(tree, 'StaffPageFrame').props.back.props.onClick(); tree = h.render();
  assert.deepEqual(component(tree, 'PosCart').props.items, []);
  const reloaded = harness('src/app/caisse/manual/page.tsx', {}, mocks);
  reloaded.render(); reloaded.effects[0](); await settle(); tree = reloaded.render();
  panel = component(tree, 'CardPayment'); assert.equal(panel.props.receipt.id, paidOrder.id); assert.deepEqual(reloaded.state.items, []);
  component(tree, 'StaffPageFrame').props.back.props.onClick(); tree = reloaded.render();
  component(tree, 'ProductGrid').props.onAdd({ id: 'meal' }); tree = reloaded.render();
  assert.equal(component(tree, 'PosCart').props.items.length, 1);
  assert.equal(component(tree, 'PosCart').props.cashDisabled, false);
  assert.ok(requests.every(([, method]) => method === 'GET'));
  const readRequest = global.fetch;
  const cashReceipt = { ...paidOrder, id: 'cash-b', payment: 'cash', payment_provider: null, stripe_payment_intent_id: null,
    cash_received_cents: 1000, change_given_cents: 0 };
  global.fetch = async (url, init) => {
    if (init?.method === 'POST') return Response.json({ ok: true, order: { id: 'cash-b', amountCents: 1000 } });
    if (init?.method === 'PATCH') return Response.json({ ok: true, order: cashReceipt });
    return readRequest(url, init);
  };
  component(tree, 'PosCart').props.onCash(); tree = reloaded.render();
  component(tree, 'CashPayment').props.onReceived('10'); tree = reloaded.render();
  component(tree, 'CashPayment').props.onConfirm(); await settle(); tree = reloaded.render();
  assert.equal(component(tree, 'CashPayment').props.receipt.id, 'cash-b');
  assert.equal(component(tree, 'CardPayment'), undefined);
  assert.equal(localStorage.getItem(paid.paidCardKey(key)), null);
});

test('public creation associates the submitted snapshot, never a basket edited while the request was in flight', async t => {
  setup(t); const cart = load('src/lib/cart.ts'), paid = load('src/lib/paid-cart.ts');
  await cart.replaceCart(items);
  let respond;
  global.fetch = async (url, init) => {
    assert.equal(url, '/api/orders'); assert.equal(init.method, 'POST');
    assert.equal(JSON.parse(init.body).items[0].qty, 1);
    return new Promise(resolve => { respond = resolve; });
  };
  const h = harness('src/app/cart/page.tsx', { cart: items, eventId: 'event-a', eventName: 'A', payment: 'card' });
  const tree = h.render();
  const submit = findAll(tree, n => n.type === 'button' && n.props.onClick?.toString().includes('createOrderInDb'))[0];
  const pending = submit.props.onClick();
  await settle();
  await cart.clearCart(); await cart.replaceCart([{ ...items[0], qty: 2 }]);
  respond(Response.json({ ok: true, order: { id: paidOrder.id, eventId: 'event-a', payment: 'card', amountCents: 1000, createdAt: paidOrder.created_at, items } }));
  await pending;
  assert.equal(paid.readCartOrder().orderId, paidOrder.id);
  assert.equal(await paid.clearConfirmedCart(paidOrder), false); assert.equal(cart.getCart()[0].qty, 2);
  assert.equal(localStorage.getItem('af_last_order_id'), paidOrder.id);
});

for (const conflict of [false, true]) test(`home event change: conflict=${conflict}, explicit feedback and receipt safety`, async t => {
  setup(t); const cart = load('src/lib/cart.ts');
  await cart.replaceCart(items);
  localStorage.setItem('af_last_order_id', 'receipt-a');
  global.fetch = async () => Response.json({ storeConfig: { events: [{ id: 'event-a', name: 'A' }, { id: 'event-b', name: 'B' }] } });
  const h = harness('src/app/page.tsx', { lang: 'fr' });
  h.render();
  h.effects.find(fn => fn.toString().includes('captureCartEventSnapshot'))(); await settle();
  findAll(h.render(), n => n.type === 'select')[0].props.onChange({ target: { value: 'event-b' } });
  const click = () => findAll(h.render(), n => n.type === 'button' && n.props.onClick?.name === 'continueToMenu')[0].props.onClick();
  if (conflict) await cart.replaceCart(items); // Identical products, fresh revision.
  const before = cart.cartSnapshot();
  await click();
  if (conflict) {
    assert.deepEqual(cart.cartSnapshot(), before);
    assert.equal(localStorage.getItem('af_event_id'), 'event-a');
    assert.equal(localStorage.getItem('af_last_order_id'), 'receipt-a');
    assert.equal(window.location.href, '');
    const alert = findAll(h.render(), n => n.props?.role === 'alert')[0];
    assert.match(alert.props.children, /Rien n’a été effacé/);
    assert.equal(h.state.selectedEventId, '');
    assert.equal(findAll(h.render(), n => n.type === 'button' && n.props.onClick?.name === 'continueToMenu')[0].props.disabled, true);
    // Deliberately selecting again acknowledges the refreshed context.
    findAll(h.render(), n => n.type === 'select')[0].props.onChange({ target: { value: 'event-b' } });
    await click();
  }
  assert.deepEqual(cart.getCart(), []);
  assert.equal(localStorage.getItem('af_event_id'), 'event-b');
  assert.equal(localStorage.getItem('af_event_name'), 'B');
  assert.equal(window.location.href, '/menu');
});
