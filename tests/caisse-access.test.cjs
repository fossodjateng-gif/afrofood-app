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
function fixture(t, { session = cashier, menu, lock = async () => Response.json({ ok: true }), seed = {}, tabStorage = new Map() } = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new Map(), intervals = new Map(), calls = [], listeners = new Map();
  globalThis.window = {
    location: {}, setInterval: fn => { const id = intervals.size + 1; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
  };
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else delete globalThis.window; });
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousTabStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const held = new Set();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request: async (name, options, callback) => {
      if (held.has(name)) return callback(null);
      held.add(name); try { return await callback({ name }); } finally { held.delete(name); }
    },
  } } });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => tabStorage.get(key) || null, setItem: (key, value) => tabStorage.set(key, value), removeItem: key => tabStorage.delete(key),
  } });
  t.after(() => {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else delete globalThis.navigator;
    if (previousTabStorage) Object.defineProperty(globalThis, 'sessionStorage', previousTabStorage); else delete globalThis.sessionStorage;
  });
  const auth = {
    getSession: () => session, resolveCashierEventId: s => s.cashierEventId || '', getStaffRoleLabel: () => 'Kasse',
    clearSession: async () => { calls.push(['logout']); },
    staffFetch: async (url, options) => {
      calls.push([url, options]);
      if (url.startsWith('/api/admin/menu-config')) return menu || Response.json({ ok: true, storeConfig: { events: [{ id: 'event-a', name: 'Event A' }], activeEventName: 'Event A' } });
      assert.equal(url, '/api/cashier-lock', 'Access checks must not start any payment');
      return lock();
    },
  };
  const newPage = () => harness('src/app/caisse/page.tsx', seed, {
    '@/lib/staff-auth': auth,
    '@/lib/client-nav': { goBackOr: href => calls.push(['navigate', href]) },
    '@/lib/translations': { getSavedLang: () => 'de', saveLang: () => {} },
  });
  const h = newPage();
  // The page's boot, saved-event, event-config and heartbeat effects run in that order.
  const run = index => { h.render(); return h.effects[index](); };
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
  } });
  t.after(() => { if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage; });
  return { h, calls, intervals, run, storage, listeners, newPage, tabStorage };
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
    await settle();
    resolveLock(Response.json({ ok: true })); await settle();
    assert.equal(h.state.isUnlocked, true);
    assert.equal(h.state.accessError, null);
    assert.equal(findAll(h.render(), node => node.type?.name === 'OrderHistory').length, 1);
    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[1][1].body).action, 'acquire');
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
    blocked(h, failure === 'occupied' ? 'cashier_locked: other-cashier' : failure === 'server' ? 'Lock service unavailable' : 'Network unavailable');
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

test('voluntary link navigation waits for release and no heartbeat follows departure', async t => {
  let resolveRelease;
  const { h, run, calls, intervals } = fixture(t, { lock: async () => {
    const action = JSON.parse(calls[calls.length - 1][1].body).action;
    return action === 'release' ? new Promise(resolve => { resolveRelease = resolve; }) : Response.json({ ok: true });
  } });
  run(0); await settle(); run(2); await settle(); const cleanup = run(3); await settle();
  const tick = intervals.values().next().value; let prevented = false;
  const main = h.render();
  main.props.onClickCapture({ button: 0, target: { closest: () => ({ getAttribute: name => name === 'href' ? '/staff/cuisine' : null, hasAttribute: () => false }) }, preventDefault: () => { prevented = true; } });
  await settle();
  assert.equal(prevented, true);
  assert.equal(window.location.href, undefined);
  assert.equal(h.state.isUnlocked, false);
  assert.deepEqual(calls.slice(1).map(([, options]) => JSON.parse(options.body).action), ['acquire', 'release']);
  resolveRelease(Response.json({ ok: true })); await settle();
  assert.equal(window.location.href, '/staff/cuisine');
  cleanup(); tick(); await settle();
  assert.equal(calls.length, 3);
});

for (const releaseFails of [false, true]) {
  test(`logout starts revocation independently of release, release failure=${releaseFails}`, async t => {
    const { h, run, calls } = fixture(t, { lock: async () => {
      const action = JSON.parse(calls[calls.length - 1][1].body).action;
      if (action === 'release' && releaseFails) throw Error('Release unavailable');
      return Response.json({ ok: true });
    } });
    run(0); await settle(); run(2); await settle(); const cleanup = run(3); await settle();
    const button = findAll(h.render(), node => node.type === 'button' && node.props.children === 'Abmelden')[0];
    await button.props.onClick();
    await settle();
    assert.deepEqual(calls.slice(1).map(([url, options]) => url === 'logout' ? 'logout' : JSON.parse(options.body).action).sort(), ['acquire', 'logout', 'release']);
    assert.equal(window.location.href, '/team/login');
    cleanup(); await settle();
    assert.equal(calls.length, 4);
  });
}

test('pagehide preserves its server lease for refresh; a bfcache restoration stays blocked', async t => {
  const { h, run, calls, intervals, listeners } = fixture(t);
  run(0); await settle(); run(2); await settle(); const cleanup = run(3); await settle();
  const tick = intervals.values().next().value;
  listeners.get('pagehide')(); await settle();
  assert.equal(h.state.isUnlocked, false);
  listeners.get('pageshow')({ persisted: true });
  blocked(h, 'cashier_lock_lost');
  tick(); await settle();
  assert.deepEqual(calls.slice(1).map(([, options]) => JSON.parse(options.body).action), ['acquire']);
  cleanup();
});

test('caisse resumes the one-use setup lease with heartbeat instead of acquiring a second instance', async t => {
  const instanceId = '11111111-1111-4111-8111-111111111111';
  const data = new Map([['af_cashier_lease_handoff_v1', JSON.stringify({ eventId: 'event-a', instanceId })]]);
  const { h, run, calls } = fixture(t, { tabStorage: data });
  run(0); await settle(); run(2); await settle(); const cleanup = run(3); await settle();
  assert.equal(h.state.isUnlocked, true);
  assert.deepEqual(JSON.parse(calls[1][1].body), { action: 'heartbeat', eventId: 'event-a', instanceId });
  assert.equal(data.has('af_cashier_lease_handoff_v1'), false);
  cleanup(); await settle();
  assert.deepEqual(JSON.parse(calls[2][1].body), { action: 'release', eventId: 'event-a', instanceId });
});

for (const succeeds of [true, false]) {
  test(`logout finishes with stalled release and ignores the in-flight heartbeat, success=${succeeds}`, async t => {
    let finishHeartbeat, failHeartbeat;
    const { h, run, calls, intervals } = fixture(t, { lock: async () => {
      const action = JSON.parse(calls[calls.length - 1][1].body).action;
      if (action === 'heartbeat') return new Promise((resolve, reject) => { finishHeartbeat = resolve; failHeartbeat = reject; });
      if (action === 'release') return new Promise(() => {}); // Never responds.
      return Response.json({ ok: true });
    } });
    run(0); await settle(); run(2); await settle(); const cleanup = run(3); await settle();
    const tick = intervals.values().next().value; tick(); await settle();
    const button = findAll(h.render(), node => node.type === 'button' && node.props.children === 'Abmelden')[0];
    const logout = button.props.onClick();
    assert.equal(h.state.isUnlocked, false);
    assert.ok(calls.some(([url]) => url === 'logout'), 'Revocation starts before heartbeat/release can finish');
    await logout;
    assert.equal(window.location.href, '/team/login', 'Logout terminates while heartbeat and release are stalled');
    if (succeeds) finishHeartbeat(Response.json({ ok: true })); else failHeartbeat(Error('Late heartbeat failure'));
    await settle(); tick(); await settle();
    assert.equal(h.state.isUnlocked, false);
    assert.equal(h.state.accessError, null, 'Late heartbeat errors are ignored after closing');
    assert.equal(calls.filter(([url, options]) => url !== 'logout' && options?.body && JSON.parse(options.body).action === 'heartbeat').length, 1);
    assert.ok(calls.some(([url, options]) => url !== 'logout' && options?.body && JSON.parse(options.body).action === 'release'));
    cleanup();
  });
}

test('voluntary departure cannot be reopened by a successful in-flight heartbeat while release waits', async t => {
  let finishHeartbeat, finishRelease;
  const { h, run, calls, intervals } = fixture(t, { lock: async () => {
    const action = JSON.parse(calls[calls.length - 1][1].body).action;
    if (action === 'heartbeat') return new Promise(resolve => { finishHeartbeat = resolve; });
    if (action === 'release') return new Promise(resolve => { finishRelease = resolve; });
    return Response.json({ ok: true });
  } });
  run(0); await settle(); run(2); await settle(); const cleanup = run(3); await settle();
  const tick = intervals.values().next().value; tick(); await settle();
  const back = findAll(h.render(), node => node.type === 'button' && node.props.children === 'Zuruck')[0];
  back.props.onClick();
  assert.equal(h.state.isUnlocked, false);
  finishHeartbeat(Response.json({ ok: true })); await settle();
  assert.equal(h.state.isUnlocked, false);
  assert.equal(calls.some(([url]) => url === 'navigate'), false);
  tick(); await settle();
  finishRelease(Response.json({ ok: true })); await settle();
  assert.equal(calls.some(([url]) => url === 'navigate'), true);
  assert.equal(h.state.isUnlocked, false);
  cleanup();
});

test('actual caisse refresh resumes its own server lease with no pagehide release or false 423', async t => {
  let owner;
  const { h, run, calls, listeners, newPage } = fixture(t, { lock: async () => {
    const body = JSON.parse(calls[calls.length - 1][1].body);
    if (body.action === 'acquire') {
      if (owner && owner !== body.instanceId) return Response.json({ ok: false, error: 'cashier_locked' }, { status: 423 });
      owner = body.instanceId;
    } else if (body.action === 'release' && owner === body.instanceId) owner = undefined;
    return Response.json({ ok: true });
  } });
  run(0); await settle(); run(2); await settle(); const cleanup = run(3); await settle();
  assert.equal(h.state.isUnlocked, true); const originalOwner = owner;
  listeners.get('pagehide')(); cleanup(); await settle();
  assert.equal(owner, originalOwner, 'Refresh must not release the server lease');
  const refreshed = newPage(), runNew = index => { refreshed.render(); return refreshed.effects[index](); };
  runNew(0); await settle(); runNew(2); await settle(); const cleanupNew = runNew(3); await settle();
  assert.equal(refreshed.state.isUnlocked, true); assert.equal(refreshed.state.accessError, null);
  assert.equal(owner, originalOwner);
  assert.deepEqual(calls.filter(([, options]) => options?.body).map(([, options]) => JSON.parse(options.body).action), ['acquire', 'acquire']);
  cleanupNew(); await settle();
});
