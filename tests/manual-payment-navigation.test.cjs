/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, findAll } = require('./ui-harness.cjs');
const { backend } = require('./card-backend-harness.cjs');
const component = (tree, name) => findAll(tree, n => n.type?.name === name)[0];
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

for (const mode of ['cash-draft', 'cash-attempt', 'card-attempt']) test(`payment Back preserves cart and ${mode}, resumes without requests`, async t => {
  const previous = Object.fromEntries(['window', 'localStorage', 'fetch', 'navigator'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  t.after(() => { for (const [k, d] of Object.entries(previous)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  const storage = new Map(), requests = [], db = backend();
  const session = { userId: 'user-a', username: 'kasse', role: 'cashier', cashierEventId: 'event-a', workstationId: '11111111-1111-4111-8111-111111111111', workstationType: 'cashier' };
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  globalThis.window = { location: { href: '' }, addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (k, fn) => fn() } } });
  globalThis.fetch = async (url, init) => {
    requests.push([url, init]);
    if (url.startsWith('/api/admin/menu-config')) return Response.json({ ok: true, storeConfig: { events: [{ id: 'event-a', name: 'Festival A' }] }, sections: [{ id: 'food', title: { de: 'Food' }, items: [{ id: 'meal', name: { de: 'Meal' }, price: 10, visible: true, availability: { status: 'limited', remainingQty: 0 } }] }] });
    if (mode === 'cash-attempt') throw Error('Response lost; keep the same attempt');
    return db.request(url, init);
  };
  const h = harness('src/app/caisse/manual/page.tsx', {}, {
    '@/lib/staff-auth': { getSession: () => session, staffFetch: (...args) => fetch(...args), getStaffRoleLabel: () => 'Cashier' },
    '@/lib/translations': { getSavedLang: () => 'fr', saveLang() {} },
  });
  h.render(); h.effects.forEach(fn => fn()); await settle(); let tree = h.render();
  component(tree, 'ProductGrid').props.onAdd({ id: 'meal' }); tree = h.render();
  component(tree, 'ProductGrid').props.onAdd({ id: 'meal' }); tree = h.render();
  const cart = structuredClone(h.state.items);
  if (mode === 'card-attempt') { component(tree, 'PosCart').props.onCard(); await settle(); }
  else {
    component(tree, 'PosCart').props.onCash(); tree = h.render();
    component(tree, 'CashPayment').props.onReceived('50'); tree = h.render();
    if (mode === 'cash-attempt') { component(tree, 'CashPayment').props.onConfirm(); await settle(); }
  }
  tree = h.render(); const frame = component(tree, 'StaffPageFrame');
  assert.equal(frame.props.back.type, 'button'); assert.equal(frame.props.back.props.children, 'Retour / Caisse manuelle');
  const before = { storage: [...storage], cash: structuredClone(h.state.cashAttempt), card: structuredClone(h.state.cardAttempt), received: h.state.received, requests: requests.length, orders: db.orders.size, stripe: db.stripeCreates };
  frame.props.back.props.onClick(); tree = h.render();
  assert.equal(component(tree, 'CashPayment'), undefined); assert.equal(component(tree, 'CardPayment'), undefined);
  assert.deepEqual(component(tree, 'PosCart').props.items, cart);
  assert.equal(component(tree, 'StaffPageFrame').props.back.props.href, '/staff/caisse');
  assert.equal(component(tree, 'PosCart').props.cashDisabled, true);
  // Editing a frozen attempt or starting another payment is refused by existing guards.
  component(tree, 'ProductGrid').props.onAdd({ id: 'meal' });
  assert.deepEqual(h.state.items, cart);
  findAll(tree, n => n.type === 'button' && n.props.children === 'Reprendre le paiement')[0].props.onClick(); tree = h.render();
  const panel = component(tree, mode === 'card-attempt' ? 'CardPayment' : 'CashPayment');
  assert.ok(panel); assert.equal(mode === 'card-attempt' ? panel.props.attempt.amountCents : panel.props.totalCents, 2000);
  assert.deepEqual(h.state.cashAttempt, before.cash); assert.deepEqual(h.state.cardAttempt, before.card);
  assert.equal(h.state.received, before.received); assert.deepEqual([...storage], before.storage);
  assert.equal(requests.length, before.requests); assert.equal(db.orders.size, before.orders); assert.equal(db.stripeCreates, before.stripe);
  assert.equal(window.location.href, '');
});

test('cashier tools return explicitly to Espace Caisse', () => {
  for (const view of ['add', 'pricing', 'payment']) {
    const h = harness('src/app/admin/menu/page.tsx', { lang: 'fr', isUnlocked: true, staffRoleSession: 'admin' }, {
      'next/navigation': { useSearchParams: () => new URLSearchParams(`view=${view}&adminEventId=event-a&returnTo=caisse`) },
      '@/lib/staff-auth': { getSession: () => ({ role: 'admin', username: 'admin' }), getStaffRoleLabel: () => 'Admin' },
    });
    const tree = h.render(h.component.default().props.children.type);
    const back = component(tree, 'MenuLayout').props.back;
    assert.equal(back.props.href, '/staff/caisse'); assert.equal(back.props.children.join(''), 'Retour / Espace Caisse');
  }
});
