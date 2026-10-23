/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, findAll } = require('./ui-harness.cjs');

const cashier = { userId: 'cashier-a', username: 'cashier', role: 'cashier', cashierEventId: 'event-a' };
const settle = async () => { for (let n = 0; n < 4; n++) await new Promise(resolve => setImmediate(resolve)); };
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
function fixture(t, { session = cashier, menu, lock = async () => Response.json({ ok: true }), seed = {} } = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new Map(), intervals = new Map(), calls = [];
  globalThis.window = {
    location: {}, setInterval: fn => { const id = intervals.size + 1; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id),
  };
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window; });
  const auth = {
    getSession: () => session, resolveCashierEventId: s => s.cashierEventId || '', getStaffRoleLabel: () => 'Kasse',
    staffFetch: async (url, options) => {
      calls.push([url, options]);
      if (url.startsWith('/api/admin/menu-config')) return menu || Response.json({ ok: true, storeConfig: { events: [{ id: 'event-a', name: 'Event A' }], activeEventName: 'Event A' } });
      assert.equal(url, '/api/cashier-lock', 'Access checks must not start any payment');
      return lock();
    },
  };
  const h = harness('src/app/caisse/page.tsx', seed, {
    '@/lib/staff-auth': auth,
    '@/lib/translations': { getSavedLang: () => 'de', saveLang: () => {} },
  });
  // The page's boot, saved-event, event-config and heartbeat effects run in that order.
  const run = index => { h.render(); return h.effects[index](); };
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
  } });
  t.after(() => { if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage; });
  return { h, calls, intervals, run, storage };
}
function blocked(h, message) {
  const tree = h.render();
  assert.ok(text(tree).includes(message), text(tree));
  assert.equal(findAll(tree, node => node.type === 'input').length, 0);
  assert.equal(findAll(tree, node => node.type?.name === 'OrderHistory').length, 0);
  assert.doesNotMatch(text(tree), /PIN|4-stelligen|Geschutzte Kasse/);
  assert.equal(findAll(tree, node => node.type === 'button').length, 4, 'Only back and language controls remain');
}

for (const session of [null, { ...cashier, role: 'kitchen' }]) {
  test(`caisse redirects ${session ? 'unauthorized roles' : 'missing sessions'} without a PIN fallback`, async t => {
    const { h, run, calls } = fixture(t, { session });
    run(0); await settle();
    assert.equal(window.location.href, session ? '/staff' : '/team/login');
    assert.equal(h.state.staffReady, false);
    blocked(h, 'Laden...');
    assert.equal(calls.length, 0);
  });
}

test('caisse blocks a cashier without a server event even when localStorage has an event', async t => {
  const { h, run, storage, calls } = fixture(t, { session: { ...cashier, cashierEventId: undefined } });
  storage.set('af_caisse_event_id', 'event-a');
  run(0); run(1); await settle();
  run(2); run(3); await settle();
  blocked(h, 'Kein Event zugewiesen.');
  assert.equal(h.state.staffReady, false);
  assert.equal(calls.length, 0);
});

for (const role of ['cashier', 'admin']) {
  test(`caisse ${role} opens without PIN only after a successful lock confirmation`, async t => {
    let resolveLock;
    const { h, run, calls } = fixture(t, {
      session: { ...cashier, role }, lock: () => new Promise(resolve => { resolveLock = resolve; }),
    });
    blocked(h, 'Laden...');
    run(0); await settle();
    assert.equal(h.state.isUnlocked, false);
    run(2); await settle();
    const cleanup = run(3);
    blocked(h, 'Laden...');
    resolveLock(Response.json({ ok: true })); await settle();
    assert.equal(h.state.isUnlocked, true);
    assert.equal(h.state.accessError, null);
    assert.equal(findAll(h.render(), node => node.type?.name === 'OrderHistory').length, 1);
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[1][1].body).action, 'heartbeat');
    cleanup();
  });
}

for (const menu of [
  { ok: false, error: 'Configuration unavailable' },
  { ok: true, storeConfig: { events: [] } },
]) {
  test(`caisse blocks an event configuration error: ${menu.error || 'assigned event missing'}`, async t => {
    const { h, run, calls } = fixture(t, { menu: Response.json(menu, { status: menu.ok ? 200 : 503 }) });
    run(0); await settle(); run(2); await settle(); run(3);
    blocked(h, menu.error || 'Das zugewiesene Event ist nicht verfügbar.');
    assert.equal(calls.length, 1);
    assert.equal(h.state.isUnlocked, false);
  });
}

for (const failure of ['occupied', 'server', 'network']) {
  test(`caisse blocks an initial ${failure} lock failure without an unlock action`, async t => {
    const { h, run, calls } = fixture(t, { lock: async () => {
      if (failure === 'network') throw new Error('Network unavailable');
      return failure === 'occupied'
        ? Response.json({ ok: false, error: 'cashier_locked', lock: { username: 'other-cashier' } }, { status: 423 })
        : Response.json({ ok: false, error: 'Lock service unavailable' }, { status: 500 });
    } });
    run(0); await settle(); run(2); await settle(); const cleanup = run(3); await settle();
    blocked(h, failure === 'occupied' ? 'Dieses Event ist bereits von other-cashier geoffnet.' : failure === 'server' ? 'Lock service unavailable' : 'Network unavailable');
    assert.equal(h.state.isUnlocked, false);
    const stop = run(3); // A blocked state must not retry or unlock automatically.
    assert.equal(stop, undefined);
    assert.equal(calls.length, 2);
    cleanup();
  });
}

test('heartbeat failure after opening blocks the caisse and preserves uncertain card state and warning', async t => {
  let attempts = 0;
  const { h, run, intervals, calls } = fixture(t, { lock: async () => {
    if (++attempts === 1) return Response.json({ ok: true });
    throw new Error('Heartbeat unavailable');
  } });
  run(0); await settle(); run(2); await settle(); const cleanup = run(3); await settle();
  assert.equal(h.state.isUnlocked, true);
  const cardInfo = { 'pending-card': { paymentIntentId: 'pi-fixture', status: 'processing' } };
  h.state.activeTerminalOrderId = 'pending-card'; h.state.tapToPayInfo = cardInfo;
  const warning = 'Die Aktion konnte nicht bestätigt werden. Bitte den Zahlungsstatus prüfen. Keine neue Kartenzahlung starten.';
  h.state.actionError = 'Uncertain card outcome';
  assert.ok(text(h.render()).includes(warning));
  intervals.values().next().value(); await settle();
  blocked(h, 'Heartbeat unavailable');
  assert.ok(text(h.render()).includes(warning));
  assert.equal(h.state.actionError, 'Uncertain card outcome');
  assert.equal(h.state.activeTerminalOrderId, 'pending-card');
  assert.equal(h.state.tapToPayInfo, cardInfo);
  h.state.actionError = null;
  assert.ok(text(h.render()).includes(warning), 'An active card still needs a warning without an action error');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(([url]) => !/stripe|terminal|payment/i.test(url)));
  cleanup();
});
