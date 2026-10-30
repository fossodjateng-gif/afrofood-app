/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { load, harness, findAll } = require('./ui-harness.cjs');
const id = 'a'.repeat(64), replacement = 'b'.repeat(64);
const station = '11111111-1111-4111-8111-111111111111', instance = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const settle = () => new Promise(resolve => setImmediate(resolve));
const storageKey = 'af_admin_cashier_context_v1';
function clientFixture(t) {
  const before = { window: global.window, sessionStorage: global.sessionStorage, fetch: global.fetch };
  const storage = new Map(), requests = [], identity = { userId: 'admin', username: 'anaclet', role: 'admin', loggedAt: '' };
  const server = { contextId: id, eventId: 'testmaison', workstationId: station, instanceId: instance, expiresAt: new Date(Date.now() + 60000).toISOString() };
  let valid = true, delegated = 0;
  global.window = { location: { href: '', assign() {} } };
  global.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  global.fetch = async (url, init = {}) => {
    requests.push({ url, ...init });
    if (init.method === 'POST') return Response.json({ ok: true, context: server });
    if (init.method === 'DELETE') return Response.json({ ok: true, closed: true });
    const headers = new Headers(init.headers);
    if (url === '/api/staff/cashier-context') {
      if (!valid || headers.get('x-cashier-context-id') !== server.contextId || headers.get('x-workstation-id') !== station) return Response.json({ ok: false }, { status: 403 });
      return Response.json({ ok: true, context: { ...server, userId: identity.userId, username: identity.username, role: 'admin', workstationName: 'Caisse Maison' } });
    }
    return Response.json({ ok: true });
  };
  const mocks = { '@/lib/staff-auth': { getSession: () => identity, refreshStaffSession: async () => identity,
    staffFetch: (...args) => { delegated++; return global.fetch(...args); } } };
  const client = load('src/lib/temporary-cashier-client.ts', mocks);
  t.after(() => { Object.assign(global, before); });
  return { client, identity, server, storage, requests, mocks, invalidate: () => { valid = false; }, get delegated() { return delegated; } };
}
function workspace(t, occupied = false) {
  const previous = global.window, navigated = [], opened = [], identity = { username: 'anaclet', role: 'admin', userId: 'admin' };
  global.window = { location: { assign: href => navigated.push(href) } };
  t.after(() => { global.window = previous; });
  const h = harness('src/app/staff/admin/events/page.tsx', {
    lang: 'fr', events: [{ id: 'testmaison', name: 'TestMaison' }], choice: { eventId: 'testmaison', id: station },
    workstations: { testmaison: { cashier: [{ id: station, name: 'Valide', active: true, type: 'cashier' }, { id: 'inactive', name: 'Inactive', active: false, type: 'cashier' }, { id: 'kitchen', name: 'Cuisine', active: true, type: 'kitchen' }], kitchen: [] }, other: { cashier: [{ id: 'foreign', name: 'Autre', active: true, type: 'cashier' }] } },
  }, {
    'next/link': () => null, 'next/navigation': { useSearchParams: () => new URLSearchParams('eventId=testmaison&space=caisse') },
    '@/lib/staff-auth': { getSession: () => identity, getStaffRoleLabel: () => 'Admin' },
    '@/lib/cashier-lease-client': { openCashierLease: async () => ({ instanceId: instance, handoff() {}, detach: async () => {} }) },
    '@/lib/temporary-cashier-client': { openTemporaryCashierContext: async (...args) => { opened.push(args); if (occupied) throw Error('cashier_locked'); return { contextId: id }; } },
  });
  const render = () => h.render(h.component.default().props.children.type);
  return { h, render, opened, navigated, identity };
}
test('workspace offers only active cashier workstations of the selected event', t => {
  const f = workspace(t), tree = f.render();
  assert.deepEqual(findAll(tree, node => node.type === 'option').map(node => node.props.value), ['', station]);
  assert.equal(tree.props.children.props.context.role, 'Admin'); assert.equal(tree.props.children.props.context.eventName, 'TestMaison');
});
test('successful workspace opening hands off V3 and navigates only after server success', async t => {
  const f = workspace(t), before = structuredClone(f.identity);
  findAll(f.render(), node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  await settle(); assert.deepEqual(f.opened, [['testmaison', station, instance]]); assert.deepEqual(f.navigated, ['/staff/caisse']); assert.deepEqual(f.identity, before);
});
test('occupied register stays in workspace and displays a readable refusal', async t => {
  const f = workspace(t, true); findAll(f.render(), node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  await settle(); assert.deepEqual(f.navigated, []); assert.match(f.h.state.openingError, /occupée/);
});
test('temporary transport keeps real Admin identity/permanent assignment unchanged and does not use URL context', async t => {
  const f = clientFixture(t), before = structuredClone(f.identity);
  await f.client.openTemporaryCashierContext('testmaison', station, instance);
  assert.equal(f.client.getCashierSession(), null, 'An unverified storage hint cannot open the register');
  const session = await f.client.refreshCashierSession();
  assert.equal(session.role, 'admin'); assert.equal(session.cashierEventId, 'testmaison'); assert.equal(session.workstationId, station);
  assert.equal(f.client.getCashierSession().temporaryContextId, id); assert.deepEqual(f.identity, before);
  await f.client.cashierFetch('/api/orders', { method: 'POST' });
  const headers = new Headers(f.requests.at(-1).headers);
  assert.equal(headers.get('x-cashier-context-id'), id); assert.equal(headers.get('x-cashier-instance-id'), instance);
  assert.equal(headers.get('x-staff-user-id'), 'admin'); assert.equal(headers.get('x-workstation-id'), station);
  assert.ok(!f.requests.some(r => r.url.includes(id)));
});
test('permanent cashier uses unchanged identity and ordinary staffFetch', async t => {
  const f = clientFixture(t); Object.assign(f.identity, { role: 'cashier', cashierEventId: 'permanent', workstationId: station });
  const session = await f.client.refreshCashierSession(); assert.equal(session, f.identity);
  await f.client.cashierFetch('/api/orders'); assert.equal(f.delegated, 1);
  assert.equal(new Headers(f.requests[0].headers).has('x-cashier-context-id'), false);
});
test('invalid temporary context refuses entry without falling back to a valid permanent assignment', async t => {
  const f = clientFixture(t); Object.assign(f.identity, { cashierEventId: 'permanent', workstationId: station });
  await f.client.openTemporaryCashierContext('testmaison', station, instance); f.invalidate();
  await assert.rejects(f.client.refreshCashierSession()); assert.equal(f.client.getCashierSession(), null);
  await assert.rejects(f.client.cashierFetch('/api/orders')); assert.equal(f.identity.cashierEventId, 'permanent');
});
test('quit stops lifecycle, closes the exact captured context and returns to the same workspace', async t => {
  const f = clientFixture(t); await f.client.openTemporaryCashierContext('testmaison', station, instance);
  let suspended = false;
  const destination = await f.client.quitTemporaryCashier(async () => { suspended = true; });
  assert.equal(suspended, true); assert.equal(destination, '/staff/admin/events?eventId=testmaison');
  assert.deepEqual(JSON.parse(f.requests.at(-1).body), { contextId: id }); assert.equal(f.storage.has(storageKey), false);
});
test('an older asynchronous close never clears a newer tab context', async t => {
  const f = clientFixture(t); await f.client.openTemporaryCashierContext('testmaison', station, instance);
  await f.client.quitTemporaryCashier(async () => {
    f.storage.set(storageKey, JSON.stringify({ ...f.server, userId: 'admin', contextId: replacement }));
  });
  assert.equal(JSON.parse(f.storage.get(storageKey)).contextId, replacement);
  assert.deepEqual(JSON.parse(f.requests.at(-1).body), { contextId: id });
});
test('reload needs server validation and a lost lease blocks requests until explicit reopening', async t => {
  const f = clientFixture(t); await f.client.openTemporaryCashierContext('testmaison', station, instance);
  const reload = load('src/lib/temporary-cashier-client.ts', f.mocks);
  assert.equal(reload.getCashierSession(), null); await reload.refreshCashierSession();
  reload.blockTemporaryCashierContext(id); await assert.rejects(reload.cashierFetch('/api/orders'));
  await assert.rejects(reload.refreshCashierSession()); assert.equal(reload.getCashierSession(), null);
});
test('temporary lifecycle resumes with heartbeat only and lock loss prevents pageshow reacquisition', async t => {
  const f = clientFixture(t); await f.client.openTemporaryCashierContext('testmaison', station, instance);
  const session = await f.client.refreshCashierSession();
  let beat, heartbeatCalls = 0, acquireCalls = 0, unlocked = false, error;
  const listeners = {}, closingRef = { current: false }, suspendedRef = { current: false };
  global.window = { setInterval: fn => { beat = fn; return 1; }, clearInterval() {}, addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {}, location: {} };
  const life = load('src/lib/cashier-lifecycle.ts', { '@/lib/temporary-cashier-client': f.client,
    '@/lib/cashier-lease-client': { openCashierLease: async (_event, _station, expected) => {
      assert.equal(expected, instance); return { detach: async () => {}, acquire: async () => { acquireCalls++; }, heartbeat: async () => { if (++heartbeatCalls > 1) throw Error('cashier_lock_lost'); } };
    } } });
  const running = life.startCashierLifecycle({ session, eventId: 'testmaison', lockError: 'Caisse', unknownError: 'Unavailable', closingRef, suspendedRef,
    suspendCashierRef: { current: null }, cashierLeaseRef: { current: null }, setIsUnlocked: value => { unlocked = value; }, setAccessError: value => { error = value; } });
  await settle(); assert.equal(unlocked, true); beat(); await settle();
  assert.equal(unlocked, false); assert.match(error, /cashier_lock_lost/); assert.equal(closingRef.current, true);
  listeners.pageshow({ persisted: true }); await settle(); assert.equal(acquireCalls, 0); assert.equal(heartbeatCalls, 2);
  await assert.rejects(f.client.cashierFetch('/api/orders')); running.dispose();
});

function protectedServer() {
  class StaffAuthError extends Error { constructor(code, status = 401) { super(code); this.code = code; this.status = status; } }
  const actor = { id: 'admin', username: 'anaclet', role: 'admin', active: true, cashierEventId: null, workstationId: null };
  const row = { cashier_context_id: id, cashier_context_event_id: 'testmaison', cashier_context_workstation_id: station,
    cashier_context_instance_id: instance, cashier_context_created_at: new Date(Date.now() - 1000),
    cashier_context_expires_at: new Date(Date.now() + 60000), session_expires_at: new Date(Date.now() + 120000) };
  let liveLease = true;
  const sql = async (strings) => {
    const q = strings.join('?');
    if (q.includes('SELECT cashier_context_expires_at')) return [{ cashier_context_expires_at: row.cashier_context_expires_at }];
    if (q.includes('FROM staff_sessions')) return [row];
    if (q.includes('FROM app_settings')) return [{ setting_value: { events: [{ id: 'testmaison' }] } }];
    throw Error('Unexpected query');
  };
  const cache = new Map(), mocks = {
    '@/lib/db': { sql }, '@/lib/admin-cashier-context-server': {},
    '@/lib/staff-session-server': { StaffAuthError, staffSessionHash: () => 'server-only', requireStaffSession: async () => actor,
      requireAssignedCashRegister: async () => { throw Error('No permanent assignment'); }, requireStaffOrigin: req => { if (req.headers.get('origin') !== 'http://localhost') throw new StaffAuthError('invalid_origin', 403); } },
    '@/lib/workstations-server': { getWorkstations: async () => ({ cashier: [{ id: station, name: 'Caisse Maison', active: true, type: 'cashier' }], kitchen: [] }) },
    '@/lib/cashier-locks': { cashierLeaseGuard: async context => {
      assert.equal(context.contextId, id); assert.equal(context.instanceId, instance);
      assert.equal(context.eventId, 'testmaison'); assert.equal(context.workstationId, station);
      if (!liveLease) throw Error('cashier_lease_required');
    } },
  };
  return { write: load('src/lib/cashier-write-context.ts', mocks, cache), api: load('src/app/api/staff/cashier-context/route.ts', mocks, cache),
    loseLease: () => { liveLease = false; } };
}
test('entry GET verifies real Admin identity and live lease; forged workstation/context is refused', async () => {
  const server = protectedServer();
  const req = extra => new Request('http://localhost/api/staff/cashier-context', { headers: { 'x-cashier-context-id': id, 'x-cashier-instance-id': instance, 'x-workstation-id': station, ...extra } });
  const response = await server.api.GET(req()); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.context.role, 'admin'); assert.equal(data.context.userId, 'admin');
  assert.equal(data.context.workstationName, 'Caisse Maison'); assert.ok(!JSON.stringify(data).includes('server-only'));
  assert.equal((await server.api.GET(req({ 'x-workstation-id': 'forged' }))).status, 403);
  assert.equal((await server.api.GET(req({ 'x-cashier-context-id': replacement }))).status, 403);
  server.loseLease(); assert.equal((await server.api.GET(req())).status, 423);
});
test('manual cash transport reaches real write resolver; forged event/workstation is refused by server', async t => {
  const f = clientFixture(t), server = protectedServer();
  await f.client.openTemporaryCashierContext('testmaison', station, instance); await f.client.refreshCashierSession();
  const { confirmPosCash } = load('src/lib/pos-cash.ts', f.mocks);
  const before = structuredClone(f.identity), calls = [];
  global.fetch = async (url, init) => {
    calls.push(url); const body = JSON.parse(init.body);
    const req = new Request('http://localhost' + url, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), origin: 'http://localhost' } });
    const resolved = await server.write.requireCashierWrite(req, body.eventId || 'testmaison', body.workstationId);
    if (url === '/api/orders') return Response.json({ ok: true, order: { id: 'cash-1', amountCents: 100 } });
    return Response.json({ ok: true, order: { id: 'cash-1', status: 'NEW', amount_cents: 100, cash_received_cents: 150, change_given_cents: 50,
      created_by: resolved.userId, paid_by: resolved.userId, paid_register_id: resolved.workstationId } });
  };
  const attempt = { key: 'cash-key', userId: 'admin', role: 'admin', workstationId: station, eventId: 'testmaison', eventName: 'TestMaison', items: [], amountCents: 100 };
  const receipt = await confirmPosCash(attempt, 150, () => {}, f.client.cashierFetch);
  assert.equal(receipt.paid_by, 'admin'); assert.equal(receipt.paid_register_id, station);
  assert.deepEqual(calls, ['/api/orders', '/api/orders/cash-1/status']); assert.deepEqual(f.identity, before);
  await assert.rejects(f.client.cashierFetch('/api/orders', { method: 'POST', body: JSON.stringify({ eventId: 'forged', workstationId: station }) }), /cashier_event_context_mismatch/);
  await assert.rejects(f.client.cashierFetch('/api/orders', { method: 'POST', body: JSON.stringify({ eventId: 'testmaison', workstationId: 'forged' }) }), /workstation_context_mismatch/);
});
test('duplicate tab cannot choose another V3 instance to join a temporary context', async t => {
  const f = clientFixture(t); await f.client.openTemporaryCashierContext('testmaison', station, instance);
  const descriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
  Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request: async (_key, _options, callback) => callback(null) } } });
  t.after(() => { if (descriptor) Object.defineProperty(global, 'navigator', descriptor); else delete global.navigator; });
  const lease = load('src/lib/cashier-lease-client.ts', { ...f.mocks, '@/lib/temporary-cashier-client': f.client });
  await assert.rejects(lease.openCashierLease('testmaison', station, instance), /cashier_context_instance_conflict/);
  assert.equal(JSON.parse(f.storage.get(storageKey)).instanceId, instance);
});
test('permanent cashier lifecycle still acquires normally and keeps the 30-second heartbeat', async t => {
  const f = clientFixture(t); Object.assign(f.identity, { role: 'cashier', cashierEventId: 'permanent', workstationId: station });
  let acquired = 0, heartbeat = 0, unlocked = false, interval;
  global.window = { setInterval: (fn, delay) => { interval = fn; assert.equal(delay, 30000); return 1; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} };
  const lifecycle = load('src/lib/cashier-lifecycle.ts', { '@/lib/temporary-cashier-client': f.client,
    '@/lib/cashier-lease-client': { openCashierLease: async (_event, _station, required) => {
      assert.equal(required, undefined); return { handedOff: false, detach: async () => {}, acquire: async () => { acquired++; }, heartbeat: async () => { heartbeat++; } };
    } } });
  const running = lifecycle.startCashierLifecycle({ session: f.identity, eventId: 'permanent', lockError: 'Caisse', unknownError: 'Unavailable',
    closingRef: { current: false }, suspendedRef: { current: false }, suspendCashierRef: { current: null }, cashierLeaseRef: { current: null },
    setIsUnlocked: value => { unlocked = value; }, setAccessError() {} });
  await settle(); assert.equal(acquired, 1); assert.equal(unlocked, true); interval(); await settle(); assert.equal(heartbeat, 1); running.dispose();
});

async function toolsWorkspace(t, { invalid = false, mismatch = false } = {}) {
  const f = clientFixture(t);
  f.server.expiresAt = new Date(Date.now() + 600000).toISOString();
  await f.client.openTemporaryCashierContext('testmaison', station, instance);
  if (invalid) f.invalidate();
  const navigated = [], listeners = {}, before = structuredClone(f.identity);
  let now = Date.now(), deadline = now + 120000, beat, acquired = 0, heartbeats = 0, lost = false, detached = 0;
  global.window = { location: { search: mismatch ? '?adminEventId=other' : '', assign: href => navigated.push(href) },
    setInterval: (fn, ms) => { assert.equal(ms, 30000); beat = fn; return 1; }, clearInterval() {},
    addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} };
  const h = harness('src/components/TemporaryCashierWorkspace.tsx', {}, {
    '@/lib/temporary-cashier-client': f.client,
    '@/lib/cashier-lease-client': { openCashierLease: async (event, selected, required) => {
      assert.deepEqual([event, selected, required], ['testmaison', station, instance]);
      return { detach: async () => { detached++; }, acquire: async () => { acquired++; }, heartbeat: async () => {
        heartbeats++; if (lost || now >= deadline) throw Error('cashier_lease_required'); deadline = now + 120000;
      } };
    } },
  });
  const render = () => h.render(h.component.TemporaryCashierWorkspace, { children: 'protected-tools' });
  render(); const bootCleanup = h.effects[0](); await settle();
  render(); const lifecycleCleanup = h.effects[1](); await settle();
  const activeWindow = global.window;
  t.after(() => {
    const restoredWindow = global.window; global.window = activeWindow;
    try { lifecycleCleanup?.(); bootCleanup(); } finally { global.window = restoredWindow; }
  });
  return { f, h, render, navigated, before, lose: () => { lost = true; },
    tick: async () => { now += 30000; beat(); await settle(); },
    get now() { return now; }, get deadline() { return deadline; }, get acquired() { return acquired; }, get heartbeats() { return heartbeats; }, get detached() { return detached; },
  };
}

test('Espace Caisse/tools keep the same temporary V3 instance alive beyond 120 seconds without acquire', async t => {
  const f = await toolsWorkspace(t);
  assert.equal(f.render().props.children, 'protected-tools');
  for (let i = 0; i < 6; i++) await f.tick();
  assert.ok(f.deadline > f.now); assert.equal(f.heartbeats, 7); assert.equal(f.acquired, 0);
  assert.deepEqual(f.f.identity, f.before); assert.equal(f.f.identity.cashierEventId, undefined);
});

test('Espace Caisse/tools hide all children after lease loss and never reacquire', async t => {
  const f = await toolsWorkspace(t); f.lose(); await f.tick();
  const tree = f.render(); assert.notEqual(tree.props.children, 'protected-tools');
  assert.equal(findAll(tree, n => n.props?.role === 'alert').length, 1);
  assert.equal(f.acquired, 0); assert.ok(f.detached > 0);
  await assert.rejects(f.f.client.cashierFetch('/api/orders'));
});

for (const options of [{ invalid: true }, { mismatch: true }]) test(`tools entry fails closed before mounting children: ${JSON.stringify(options)}`, async t => {
  const f = await toolsWorkspace(t, options); const tree = f.render();
  assert.notEqual(tree.props.children, 'protected-tools'); assert.equal(f.heartbeats, 0); assert.equal(f.acquired, 0);
});

test('Quitter la caisse/Admin suspends lifecycle, closes captured context, clears storage and returns to its event', async t => {
  const f = await toolsWorkspace(t);
  await f.render().props.value.quit();
  assert.ok(f.detached > 0); assert.deepEqual(f.navigated, ['/staff/admin/events?eventId=testmaison']);
  const request = f.f.requests.at(-1); assert.equal(request.method, 'DELETE'); assert.equal(JSON.parse(request.body).contextId, id);
  assert.equal(f.f.storage.has(storageKey), false); assert.deepEqual(f.f.identity, f.before);
});

test('Espace Caisse shows all sections and opens register history read-only for temporary Admin', () => {
  const session = { userId: 'admin', username: 'anaclet', role: 'admin', cashierEventId: 'testmaison', workstationId: station, workstationName: 'Caisse papa', workstationType: 'cashier', temporaryContextId: id };
  const h = harness('src/app/staff/caisse/page.tsx', { session, lang: 'fr' }, {
    '@/lib/temporary-cashier-client': { hasTemporaryCashierContext: () => true },
    '@/components/TemporaryCashierWorkspace': { useTemporaryCashierWorkspace: () => ({ quit: async () => {} }) },
  });
  const tree = h.render(), cards = findAll(tree, n => n.type.name === 'StaffNavigationCard');
  assert.equal(cards.length, 7);
  assert.notEqual(cards.find(n => n.props.title === 'Historique des ventes').props.disabled, true);
  assert.equal(cards.find(n => n.props.title === 'Historique des ventes').props.href, '/caisse?view=history');
  assert.equal(cards.find(n => n.props.title === 'Cuisine').props.href, '/staff/cuisine?adminEventId=testmaison');
  assert.equal(cards.find(n => n.props.title === 'Ajouter un produit').props.href, '/admin/menu?view=add&adminEventId=testmaison&returnTo=caisse');
  assert.equal(tree.props.children.props.back.type, 'button');
  assert.equal(tree.props.children.props.context.workstationName, 'Caisse papa');
});

test('session boundary covers landing and allowed tools but never duplicates the POS lifecycle', () => {
  const session = { userId: 'admin', role: 'admin', cashierEventId: null, workstationId: null };
  for (const path of ['/staff/caisse', '/admin/menu', '/staff/cuisine', '/staff/cuisine/availability', '/kitchen', '/screen', '/caisse', '/caisse/manual', '/staff/admin/events']) {
    const h = harness('src/components/StaffSessionBoundary.tsx', { snapshot: { path, session } }, {
      'next/navigation': { usePathname: () => path },
      '@/lib/temporary-cashier-client': { hasTemporaryCashierContext: () => true },
    });
    const tree = h.render(h.component.StaffSessionBoundary, { children: 'tools' });
    const protectedTools = !['/caisse', '/caisse/manual', '/staff/admin/events'].includes(path);
    assert.equal(tree.props.children?.type?.name === 'TemporaryCashierWorkspace', protectedTools, path);
  }
});
test('confirmed login/logout clears the previous tab hint without changing session authorization', async t => {
  const f = clientFixture(t), previousLocalStorage = global.localStorage;
  global.localStorage = { removeItem() {} };
  t.after(() => { global.localStorage = previousLocalStorage; });
  f.storage.set(storageKey, JSON.stringify({ ...f.server, userId: 'old-admin' }));
  global.fetch = async (_url, init) => init.method === 'DELETE' ? Response.json({ ok: true }) : Response.json({ ok: true,
    user: { id: 'permanent', username: 'cashier', role: 'cashier', cashierEventId: 'event', workstationId: station, workstationType: 'cashier' } });
  const auth = load('src/lib/staff-auth.ts');
  assert.equal((await auth.login('cashier', 'test-password')).ok, true);
  assert.equal(f.storage.has(storageKey), false); assert.equal(auth.getSession().role, 'cashier');
  assert.equal(auth.getSession().cashierEventId, 'event');
  f.storage.set(storageKey, JSON.stringify({ ...f.server, userId: 'old-admin' }));
  await auth.clearSession(); assert.equal(f.storage.has(storageKey), false); assert.equal(auth.getSession(), null);
});
