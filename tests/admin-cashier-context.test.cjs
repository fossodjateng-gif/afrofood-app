/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { load } = require('./ui-harness.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
const station = '11111111-1111-4111-8111-111111111111', otherStation = '22222222-2222-4222-8222-222222222222';
const instance = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', otherInstance = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const token = 'a'.repeat(64), device = 'b'.repeat(64), permanent = 'c'.repeat(64);

// Offline transaction model, NOT a PostgreSQL interpreter. Real TS services,
// cookie/session guards, resolver, lease keys and routes run against it. The
// PL/pgSQL functions/concurrent row locks still require isolated PostgreSQL QA.
function fixture() {
  const now = Date.now();
  const users = new Map([
    ['admin', { id: 'admin', username: 'anaclet', role: 'admin', active: true, cashier_event_id: null, workstation_id: null }],
    ['cashier', { id: 'cashier', username: 'cem', role: 'cashier', active: true, cashier_event_id: 'event-a', workstation_id: station }],
  ]);
  const sessions = new Map([[hash(token), { user: 'admin', expiry: now + 3600000, revoked: false, context: null }],
    [hash(device), { user: 'admin', expiry: now + 3600000, revoked: false, context: null }],
    [hash(permanent), { user: 'cashier', expiry: now + 3600000, revoked: false, context: null }]]);
  const events = [{ id: 'event-a', name: 'A' }, { id: 'event-b', name: 'B' }];
  const configs = new Map([['event-a', { cashier: [{ id: station, name: 'Caisse A', type: 'cashier', active: true }], kitchen: [] }],
    ['event-b', { cashier: [{ id: otherStation, name: 'Caisse B', type: 'cashier', active: true }], kitchen: [] }]]);
  const locks = new Map(), queries = [];
  let modules;
  const key = (event, stationId) => `v3:${JSON.stringify([event, stationId])}`;
  const owner = (sessionHash, context) => `v2:${sessionHash}:ctx:${context.id}:${context.instance}`;
  function session(sessionHash, actor) {
    const s = sessions.get(sessionHash), u = s && users.get(s.user);
    if (!s || s.revoked || s.expiry <= Date.now() || !u?.active || actor && u.id !== actor) throw Error('admin_required');
    return { s, u };
  }
  function config(event, stationId) {
    if (!events.some(e => e.id === event)) throw Error('cashier_context_event_invalid');
    const w = configs.get(event)?.cashier.find(w => w.id === stationId);
    if (!w?.active || w.type !== 'cashier') throw Error('workstation_assignment_invalid');
  }
  function guard(v) {
    const [sessionHash, actor, event, stationId, resource, leaseOwner, contextId, instanceId] = v;
    const { s, u } = session(sessionHash, actor);
    config(event, stationId);
    if (contextId) {
      const c = s.context;
      if (u.role !== 'admin' || !c || c.id !== contextId || c.event !== event || c.station !== stationId || c.instance !== instanceId || c.expiry <= Date.now()) throw Error('cashier_context_invalid');
      assert.equal(resource, key(event, stationId)); assert.equal(leaseOwner, owner(sessionHash, c));
    } else if (!['admin', 'cashier'].includes(u.role) || u.cashier_event_id !== event || u.workstation_id !== stationId) throw Error('cashier_context_changed');
    const lock = locks.get(resource);
    if (!lock || lock.owner !== leaseOwner || lock.expiry <= Date.now()) throw Error('cashier_lease_required');
  }
  const sql = async (strings, ...v) => {
    const q = strings.join('?'); queries.push({ q, v });
    if (q.includes('af_open_admin_cashier_context')) {
      const [sessionHash, actor, id, event, stationId, instanceId, requestedExpiry] = v;
      const { s, u } = session(sessionHash, actor);
      if (u.role !== 'admin') throw Error('admin_required');
      config(event, stationId);
      const c = { id, event, station: stationId, instance: instanceId, created: Date.now(), expiry: Math.min(Date.parse(requestedExpiry), s.expiry) };
      const previous = s.context;
      const nextLocks = new Map(locks); // Commit replacement+lease together, or discard all.
      if (previous) {
        const oldKey = key(previous.event, previous.station), oldLock = locks.get(oldKey);
        if (previous.instance !== instanceId && previous.expiry > Date.now() && oldLock?.owner === owner(sessionHash, previous) && oldLock.expiry > Date.now()) throw Error('cashier_context_instance_conflict');
        if (oldLock?.owner === owner(sessionHash, previous)) nextLocks.delete(oldKey);
      }
      const resource = key(event, stationId), target = nextLocks.get(resource);
      if (target && target.expiry > Date.now() && target.owner !== owner(sessionHash, c)) throw Error('cashier_locked');
      nextLocks.set(resource, { owner: owner(sessionHash, c), expiry: Math.min(c.expiry, Date.now() + 120000), username: u.username });
      s.context = c; locks.clear(); for (const [k, l] of nextLocks) locks.set(k, l);
      return [{ context_id: id, event_id: event, workstation_id: stationId, instance_id: instanceId, created_at: new Date(c.created), expires_at: new Date(c.expiry) }];
    }
    if (q.includes('af_close_admin_cashier_context')) {
      const [sessionHash, actor, contextId] = v, { s, u } = session(sessionHash, actor);
      if (u.role !== 'admin') throw Error('admin_required');
      if (!s.context || s.context.id !== contextId) return [{ closed: false }];
      const resource = key(s.context.event, s.context.station);
      if (locks.get(resource)?.owner === owner(sessionHash, s.context)) locks.delete(resource);
      s.context = null; return [{ closed: true }];
    }
    if (q.includes('af_heartbeat_admin_cashier_context')) {
      const [sessionHash, actor, event, stationId, contextId, instanceId] = v;
      const c = sessions.get(sessionHash).context;
      guard([sessionHash, actor, event, stationId, key(event, stationId), `v2:${sessionHash}:ctx:${contextId}:${instanceId}`, contextId, instanceId]);
      const l = locks.get(key(event, stationId)); l.expiry = Math.min(c.expiry, Date.now() + 120000);
      return [{ username: l.username, heartbeat_at: new Date(), expires_at: new Date(l.expiry) }];
    }
    if (q.includes('af_assert_cashier_lease')) { guard(v); return [{ authorized: true }]; }
    if (q.includes('UPDATE staff_sessions SET revoked_at')) { sessions.get(v[0]).revoked = true; return []; }
    if (q.includes('DELETE FROM cashier_event_locks') && q.includes('split_part')) {
      for (const [k, l] of locks) if (l.owner.split(':')[1] === v[0]) locks.delete(k);
      return [];
    }
    if (q.includes('FROM staff_sessions')) {
      let pair; try { pair = session(v[0]); } catch { return []; }
      const { s, u } = pair;
      if (q.includes('s.cashier_context_id,')) {
        const c = s.context;
        if (!c || u.role !== 'admin' || c.id !== v[2] || c.expiry <= Date.now()) return [];
        return [{ cashier_context_id: c.id, cashier_context_event_id: c.event, cashier_context_workstation_id: c.station,
          cashier_context_instance_id: c.instance, cashier_context_created_at: new Date(c.created), cashier_context_expires_at: new Date(c.expiry), session_expires_at: new Date(s.expiry) }];
      }
      if (q.includes('SELECT expires_at')) return [{ expires_at: new Date(s.expiry) }];
      return [u];
    }
    if (q.includes('FROM app_settings')) return [{ setting_value: q.includes("'store_config'") ? { events } : configs.get(v[0].slice('workstations:'.length)) }];
    throw Error('Unexpected SQL in offline model: ' + q);
  };
  const cache = new Map(), mocks = { '@/lib/db': { sql }, '@/lib/menu-settings': { getStoreConfig: async () => ({ events }) } };
  modules = {
    service: load('src/lib/admin-cashier-context-server.ts', mocks, cache),
    write: load('src/lib/cashier-write-context.ts', mocks, cache),
    lease: load('src/lib/cashier-locks.ts', mocks, cache),
    auth: load('src/lib/staff-session-server.ts', mocks, cache),
    api: load('src/app/api/staff/cashier-context/route.ts', mocks, cache),
    lockApi: load('src/app/api/cashier-lock/route.ts', mocks, cache),
  };
  const request = (sessionToken = token, context, extras = {}) => new Request('http://localhost/api/staff/cashier-context', { method: 'POST',
    headers: { cookie: `af_staff_session=${sessionToken}`, origin: 'http://localhost', ...(context ? { 'x-cashier-context-id': context.contextId, 'x-cashier-instance-id': context.instanceId } : {}), ...extras }, body: '{}' });
  const intent = { eventId: 'event-a', workstationId: station, instanceId: instance };
  const open = (data = intent, sessionToken = token) => modules.service.openAdminCashierContext(request(sessionToken), data);
  return { ...modules, users, sessions, locks, configs, events, queries, request, intent, open, key };
}

test('valid Admin open is a single atomic DB call, retains real identity and returns no session secret', async () => {
  const f = fixture(), before = structuredClone(f.users.get('admin')), c = await f.open();
  assert.match(c.contextId, /^[a-f0-9]{64}$/); assert.equal(c.eventId, 'event-a'); assert.equal(f.locks.size, 1);
  assert.deepEqual(f.users.get('admin'), before); assert.ok(Date.parse(c.expiresAt) <= f.sessions.get(hash(token)).expiry);
  assert.equal(f.queries.filter(q => q.q.includes('af_open_admin_cashier_context')).length, 1);
  assert.ok(!JSON.stringify(c).includes(hash(token)));
  const w = await f.write.requireCashierWrite(f.request(token, c), 'event-a', station);
  assert.equal(w.userId, 'admin'); assert.equal(w.username, 'anaclet'); assert.equal(w.contextId, c.contextId);
});
test('non-Admin and cross-origin opening are refused before changing context', async () => {
  const f = fixture();
  await assert.rejects(f.open(f.intent, permanent), /admin_required/);
  await assert.rejects(f.service.openAdminCashierContext(f.request(token, null, { origin: 'https://evil.invalid' }), f.intent), /invalid_origin/);
  assert.equal(f.locks.size, 0); assert.equal(f.sessions.get(hash(token)).context, null);
});
test('invalid event or foreign/non-cashier/inactive station never installs context', async () => {
  for (const change of ['event', 'foreign', 'non-cashier', 'inactive']) {
    const f = fixture(); let data = { ...f.intent };
    if (change === 'event') data.eventId = 'forged';
    if (change === 'foreign') data.workstationId = otherStation;
    if (change === 'non-cashier') f.configs.get('event-a').cashier[0].type = 'kitchen';
    if (change === 'inactive') f.configs.get('event-a').cashier[0].active = false;
    await assert.rejects(f.open(data)); assert.equal(f.sessions.get(hash(token)).context, null); assert.equal(f.locks.size, 0);
  }
});
test('busy workstation rolls back replacement and retains previous context/lease', async () => {
  const initial = fixture();
  initial.locks.set(initial.key('event-a', station), { owner: 'another-owner', expiry: Date.now() + 120000 });
  await assert.rejects(initial.open(), /cashier_locked/);
  assert.equal(initial.sessions.get(hash(token)).context, null);
  const f = fixture(), old = await f.open();
  f.locks.set(f.key('event-b', otherStation), { owner: 'someone-else', expiry: Date.now() + 120000 });
  await assert.rejects(f.open({ ...f.intent, eventId: 'event-b', workstationId: otherStation }), /cashier_locked/);
  assert.equal(f.sessions.get(hash(token)).context.id, old.contextId);
  await f.write.requireCashierWrite(f.request(token, old), 'event-a');
});
test('replacement invalidates old ID; stale close preserves new context and is idempotent', async () => {
  const f = fixture(), old = await f.open(), current = await f.open();
  assert.notEqual(old.contextId, current.contextId);
  await assert.rejects(f.write.requireCashierWrite(f.request(token, old), 'event-a'));
  assert.deepEqual(await f.service.closeAdminCashierContext(f.request(), old.contextId), { closed: false });
  await f.write.requireCashierWrite(f.request(token, current), 'event-a');
  assert.deepEqual(await f.service.closeAdminCashierContext(f.request(), current.contextId), { closed: true });
  assert.deepEqual(await f.service.closeAdminCashierContext(f.request(), current.contextId), { closed: false });
  assert.equal(f.locks.size, 0);
});
test('second instance/device cannot displace live V3 owner, including concurrent opens', async () => {
  const f = fixture(); const outcomes = await Promise.allSettled([f.open(), f.open({ ...f.intent, instanceId: otherInstance }, device)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.locks.size, 1);
  const f2 = fixture(); await f2.open();
  await assert.rejects(f2.open({ ...f2.intent, instanceId: otherInstance }), /cashier_context_instance_conflict/);
});
test('expired context/session, revoked session and inactive Admin reject writes', async () => {
  for (const change of ['context', 'session', 'revoked', 'inactive']) {
    const f = fixture(), c = await f.open(), s = f.sessions.get(hash(token));
    if (change === 'context') s.context.expiry = Date.now() - 1;
    if (change === 'session') s.expiry = Date.now() - 1;
    if (change === 'revoked') s.revoked = true;
    if (change === 'inactive') f.users.get('admin').active = false;
    await assert.rejects(f.write.requireCashierWrite(f.request(token, c), 'event-a'));
  }
});
test('lost/expired lease refuses writes AND resume/heartbeat without resurrection', async () => {
  for (const change of ['missing', 'expired', 'owner']) {
    const f = fixture(), c = await f.open(), w = await f.write.requireCashierWrite(f.request(token, c), 'event-a');
    const resource = f.key('event-a', station), l = f.locks.get(resource);
    if (change === 'missing') f.locks.delete(resource);
    if (change === 'expired') l.expiry = Date.now() - 1;
    if (change === 'owner') l.owner = 'another-owner';
    await assert.rejects(f.write.requireCashierWrite(f.request(token, c), 'event-a'), /cashier_lease_required/);
    await assert.rejects(f.lease.acquireCashierLock(w)); await assert.rejects(f.lease.heartbeatCashierLock(w));
  }
});
test('event/workstation divergence and invalid explicit context fail without permanent fallback', async () => {
  const f = fixture(), c = await f.open();
  await assert.rejects(f.write.requireCashierWrite(f.request(token, c), 'event-b'), /cashier_event_context_mismatch/);
  await assert.rejects(f.write.requireCashierWrite(f.request(token, c), 'event-a', otherStation), /workstation_context_mismatch/);
  const req = f.request(permanent, { ...c, contextId: 'f'.repeat(64) });
  await assert.rejects(f.write.requireCashierWrite(req, 'event-a'), /admin_required/);
});
test('permanent path retains six-argument guard/owner and rejects cross-event Admin writes', async () => {
  const f = fixture(), s = f.users.get('cashier');
  const input = { sessionHash: hash(permanent), userId: s.id, username: s.username, eventId: 'event-a', workstationId: station, instanceId: instance };
  const keys = f.lease.leaseKeys(input); f.locks.set(keys.event, { owner: keys.owner, expiry: Date.now() + 120000 });
  const req = f.request(permanent, null, { 'x-cashier-instance-id': instance });
  await f.write.requireCashierWrite(req, 'event-a', station);
  assert.equal(f.queries.find(q => q.q.includes('af_assert_cashier_lease')).v.length, 6);
  const admin = f.users.get('admin'); Object.assign(admin, { cashier_event_id: 'event-a', workstation_id: station });
  await assert.rejects(f.write.requireCashierWrite(f.request(token, null, { 'x-cashier-instance-id': instance }), 'event-b'), /cashier_event_context_mismatch/);
});
test('logout cleanup also covers temporary owner keys and subsequent writes fail', async () => {
  const f = fixture(), c = await f.open(); await f.auth.revokeStaffSession(f.request());
  assert.equal(f.locks.size, 0); await assert.rejects(f.write.requireCashierWrite(f.request(token, c), 'event-a'));
});
test('server endpoints and temporary lock heartbeat/release preserve instance checks', async () => {
  const f = fixture();
  const req = new Request('http://localhost/api/staff/cashier-context', { method: 'POST', headers: { cookie: `af_staff_session=${token}`, origin: 'http://localhost' }, body: JSON.stringify(f.intent) });
  const response = await f.api.POST(req); assert.equal(response.status, 200); const c = (await response.json()).context;
  const lockReq = (action, selected = instance) => new Request('http://localhost/api/cashier-lock', { method: 'POST', headers: { cookie: `af_staff_session=${token}`, origin: 'http://localhost', 'x-cashier-context-id': c.contextId, 'x-cashier-instance-id': instance }, body: JSON.stringify({ action, eventId: 'event-a', workstationId: station, instanceId: selected }) });
  assert.equal((await f.lockApi.POST(lockReq('heartbeat', otherInstance))).status, 403);
  assert.equal((await f.lockApi.POST(lockReq('heartbeat'))).status, 200);
  const close = new Request('http://localhost/api/staff/cashier-context', { method: 'DELETE', headers: { cookie: `af_staff_session=${token}`, origin: 'http://localhost' }, body: JSON.stringify({ contextId: c.contextId }) });
  assert.equal((await f.api.DELETE(close)).status, 200); assert.equal(f.locks.size, 0);
  const again = await f.open();
  const release = new Request('http://localhost/api/cashier-lock', { method: 'POST', headers: { cookie: `af_staff_session=${token}`, origin: 'http://localhost', 'x-cashier-context-id': again.contextId, 'x-cashier-instance-id': instance }, body: JSON.stringify({ action: 'release', eventId: 'event-a', workstationId: station, instanceId: instance }) });
  assert.equal((await f.lockApi.POST(release)).status, 200);
  assert.equal(f.locks.size, 0); assert.equal(f.sessions.get(hash(token)).context, null);
});
test('prepared migration retains permanent overload and contains row locks/atomic lease checks', () => {
  const source = fs.readFileSync('scripts/add_staff_cashier_context.sql', 'utf8');
  assert.match(source, /RETURN af_assert_cashier_lease\(p_session, p_actor, p_event, p_station, p_key, p_owner\)/);
  assert.match(source, /FOR UPDATE OF s FOR SHARE OF u/);
  assert.match(source, /cashier_event_locks\.expires_at <= clock_timestamp\(\) OR cashier_event_locks\.user_id = EXCLUDED\.user_id/);
  assert.match(source, /IF NOT FOUND THEN RAISE EXCEPTION 'cashier_locked'/);
  assert.match(source, /saved\.cashier_context_id IS DISTINCT FROM p_context/);
  assert.match(source, /INTERVAL '120 seconds'/);
});
