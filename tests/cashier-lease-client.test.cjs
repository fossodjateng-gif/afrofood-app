/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, harness, findAll } = require('./ui-harness.cjs');
const instance = '11111111-1111-4111-8111-111111111111';
const settle = async () => { for (let n = 0; n < 4; n++) await new Promise(resolve => setImmediate(resolve)); };

function browserTabs(t) {
  const previous = Object.fromEntries(['navigator', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const held = new Set();
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request: async (name, options, callback) => {
      if (held.has(name)) return callback(null);
      held.add(name); try { return await callback({ name }); } finally { held.delete(name); }
    },
  } } });
  t.after(() => { for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const activate = storage => Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  } });
  return { activate };
}

test('client stops new heartbeats, drains the in-flight acquisition, then releases only its own instance', async () => {
  const calls = []; let resolveAcquire;
  const { createCashierLease } = load('src/lib/cashier-lease-client.ts', { '@/lib/staff-auth': { staffFetch: async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body, options });
    return body.action === 'acquire' ? new Promise(resolve => { resolveAcquire = resolve; }) : Response.json({ ok: true });
  } } });
  const lease = createCashierLease('event-a', instance);
  const acquired = lease.acquire(); await settle();
  const heartbeat = lease.heartbeat();
  const skipped = assert.rejects(heartbeat, /cashier_lock_closed/);
  const released = lease.release();
  assert.equal(lease.release(), released, 'Release is idempotent');
  assert.equal(calls.length, 1, 'Release must wait for the pending acquisition');
  resolveAcquire(Response.json({ ok: true }));
  await acquired; await skipped; await released;
  assert.deepEqual(calls.map(call => call.body.action), ['acquire', 'release']);
  assert.deepEqual(calls[1].body, { action: 'release', eventId: 'event-a', instanceId: instance });
  assert.equal(calls[1].options.keepalive, true);
  assert.equal(new Headers(calls[0].options.headers).has('x-staff-role'), false);
  await assert.rejects(lease.heartbeat(), /cashier_lock_closed/);
  await assert.rejects(lease.acquire(), /cashier_lock_closed/);
  assert.equal(calls.length, 2);
});

test('network uncertainty during acquisition still allows owner-bound cleanup without another acquisition', async () => {
  const calls = [];
  const { createCashierLease } = load('src/lib/cashier-lease-client.ts', { '@/lib/staff-auth': { staffFetch: async (_, options) => {
    const { action } = JSON.parse(options.body); calls.push(action);
    if (action === 'acquire') throw Error('Response lost');
    return Response.json({ ok: true });
  } } });
  const lease = createCashierLease('event-a', instance);
  await assert.rejects(lease.acquire(), /Response lost/);
  await lease.release();
  assert.deepEqual(calls, ['acquire', 'release']);
});

test('setup handoff is event-specific, one-use and contains no credentials or role', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), data = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous); else delete globalThis.sessionStorage; });
  const { createCashierLease, takeCashierLeaseHandoff } = load('src/lib/cashier-lease-client.ts', { '@/lib/staff-auth': {} });
  const lease = createCashierLease('event-a', instance);
  lease.handoff();
  assert.deepEqual(JSON.parse([...data.values()][0]), { eventId: 'event-a', instanceId: instance });
  assert.equal(takeCashierLeaseHandoff('event-a'), instance);
  assert.equal(takeCashierLeaseHandoff('event-a'), undefined);
  lease.handoff();
  assert.equal(takeCashierLeaseHandoff('event-b'), undefined);
  assert.equal(takeCashierLeaseHandoff('event-a'), undefined);
});

test('actual setup page acquires using the stable event ID and hands off its instance without a payment request', async t => {
  const previous = Object.fromEntries(['window', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const data = new Map(), calls = [];
  globalThis.window = { location: {} };
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } });
  t.after(() => { for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const auth = { getStaffRoleLabel: () => 'Kasse', staffFetch: async (url, options) => {
    assert.equal(url, '/api/cashier-lock'); calls.push(JSON.parse(options.body)); return Response.json({ ok: true });
  } };
  const page = harness('src/app/caisse/setup/page.tsx', {
    session: { userId: 'fixture', username: 'cashier', role: 'cashier' }, staffRole: 'cashier', cashierLockEventId: 'event-a',
    loading: false, isOnline: true, hasServerConnection: true, terminalSetupUrl: 'afrofood://setup',
    tapConfig: { awarenessSeen: true, termsAccepted: true, educationSeen: true, readinessStatus: 'ready' },
  }, { '@/lib/staff-auth': auth });
  const button = findAll(page.render(), node => node.type === 'button' && String(node.props.onClick).includes('openCashierWithEventLock'))[0];
  assert.ok(button);
  button.props.onClick(); await settle();
  assert.equal(window.location.href, '/caisse');
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['action', 'eventId', 'instanceId']);
  assert.equal(calls[0].action, 'acquire'); assert.equal(calls[0].eventId, 'event-a');
  const { takeCashierLeaseHandoff } = load('src/lib/cashier-lease-client.ts', { '@/lib/staff-auth': auth });
  assert.equal(takeCashierLeaseHandoff('event-a'), calls[0].instanceId);
});

test('refresh keeps its instance and resumes the live lease without sending release', async t => {
  const { activate } = browserTabs(t), storage = new Map(), calls = []; activate(storage);
  let owner;
  const { openCashierLease } = load('src/lib/cashier-lease-client.ts', { '@/lib/staff-auth': { staffFetch: async (_, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (body.action === 'acquire') {
      if (owner && owner !== body.instanceId) return Response.json({ ok: false, error: 'cashier_locked' }, { status: 423 });
      owner = body.instanceId;
    } else if (body.action === 'release' && owner === body.instanceId) owner = undefined;
    return Response.json({ ok: true });
  } } });
  const oldDocument = await openCashierLease('event-a'); await oldDocument.acquire();
  await oldDocument.detach(); // Refresh terminates document ownership, not the server lease.
  const refreshed = await openCashierLease('event-a'); await refreshed.acquire();
  assert.equal(refreshed.instanceId, oldDocument.instanceId);
  assert.deepEqual(calls.map(call => call.action), ['acquire', 'acquire']);
  assert.equal(owner, refreshed.instanceId);
  await refreshed.release();
});

test('a real second tab with copied sessionStorage gets a different instance and cannot join the live lease', async t => {
  const { activate } = browserTabs(t), storageA = new Map(); activate(storageA);
  let owner;
  const { openCashierLease } = load('src/lib/cashier-lease-client.ts', { '@/lib/staff-auth': { staffFetch: async (_, options) => {
    const body = JSON.parse(options.body);
    if (body.action === 'acquire') {
      if (owner && owner !== body.instanceId) return Response.json({ ok: false, error: 'cashier_locked' }, { status: 423 });
      owner = body.instanceId;
    } else if (body.action === 'release' && owner === body.instanceId) owner = undefined;
    return Response.json({ ok: true });
  } } });
  const a = await openCashierLease('event-a'); await a.acquire();
  const storageB = new Map(storageA); activate(storageB);
  const b = await openCashierLease('event-a');
  assert.notEqual(b.instanceId, a.instanceId);
  await assert.rejects(b.acquire(), /cashier_locked/);
  await b.release(); assert.equal(owner, a.instanceId);
  activate(storageA); await a.release();
});

test('setup handoff is consumed by the tab binding and survives the subsequent refresh as the same instance', async t => {
  const { activate } = browserTabs(t), storage = new Map(); activate(storage);
  const { createCashierLease, openCashierLease } = load('src/lib/cashier-lease-client.ts', { '@/lib/staff-auth': { staffFetch: async () => Response.json({ ok: true }) } });
  const setup = createCashierLease('event-a', instance); await setup.acquire(); setup.handoff();
  const main = await openCashierLease('event-a');
  assert.equal(main.instanceId, instance); assert.equal(main.handedOff, true);
  assert.equal(storage.has('af_cashier_lease_handoff_v1'), false);
  await main.heartbeat(); await main.detach();
  const refreshed = await openCashierLease('event-a');
  assert.equal(refreshed.instanceId, instance); assert.equal(refreshed.handedOff, false);
  await refreshed.release();
});

test('tab isolation fails closed when Web Locks is unavailable', async t => {
  const { activate } = browserTabs(t); activate(new Map());
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const { openCashierLease } = load('src/lib/cashier-lease-client.ts', { '@/lib/staff-auth': { staffFetch: () => { throw Error('No request expected'); } } });
  await assert.rejects(openCashierLease('event-a'), /cashier_tab_isolation_unavailable/);
});

test('detach cancels queued heartbeats and frees the Web Lock without waiting for the old network request', async t => {
  const { activate } = browserTabs(t), storage = new Map(), calls = []; activate(storage);
  let finishAcquire;
  const { openCashierLease } = load('src/lib/cashier-lease-client.ts', { '@/lib/staff-auth': { staffFetch: async (_, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (calls.length === 1) return new Promise(resolve => { finishAcquire = resolve; });
    return Response.json({ ok: true });
  } } });
  const old = await openCashierLease('event-a');
  const acquiring = old.acquire(); await settle();
  const queued = assert.rejects(old.heartbeat(), /cashier_lock_closed/);
  await old.detach();
  const restored = await openCashierLease('event-a');
  assert.equal(restored.instanceId, old.instanceId);
  await restored.acquire();
  finishAcquire(Response.json({ ok: true })); await acquiring; await queued;
  await assert.rejects(old.heartbeat(), /cashier_lock_closed/);
  assert.deepEqual(calls.map(body => body.action), ['acquire', 'acquire']);
  assert.equal(storage.get('af_cashier_instance_v1:event-a'), old.instanceId);
  await restored.release();
});
