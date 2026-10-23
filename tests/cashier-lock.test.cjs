/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { load } = require('./ui-harness.cjs');

const instanceA = '11111111-1111-4111-8111-111111111111';
const instanceB = '22222222-2222-4222-8222-222222222222';
const station = '33333333-3333-4333-8333-333333333333';
const lockKey = event => `v3:${JSON.stringify([event,station])}`;
const digest = value => createHash('sha256').update(value).digest('hex');

function fixture() {
  let now = Date.now();
  let afterAuthorization;
  const users = new Map([
    ['a', { id: 'louka-fixture', username: 'louka', role: 'cashier', active: true, cashier_event_id: 'event-a', workstation_id: station }],
    ['b', { id: 'cem-fixture', username: 'cem', role: 'cashier', active: true, cashier_event_id: 'event-a', workstation_id: station }],
    ['c', { id: 'admin-fixture', username: 'admin', role: 'admin', active: true, cashier_event_id: 'event-a', workstation_id: station }],
    ['d', { id: 'kitchen-fixture', username: 'kitchen', role: 'kitchen', active: true, cashier_event_id: 'event-a', workstation_id: station }],
  ]);
  const sessions = new Map([...users].map(([token, user]) => [digest(token.repeat(64)), { user, revoked: false, expires: now + 7200000 }]));
  const locks = new Map(), queries = [];
  const valid = (hash, userId, eventId) => {
    const s = sessions.get(hash), u = s?.user;
    return s && !s.revoked && s.expires > now && u.active && u.id === userId && (u.role === 'admin' || (u.role === 'cashier' && u.cashier_event_id === eventId));
  };
  const renewed = (key, owner, username) => {
    const row = { event_name: key, user_id: owner, username, heartbeat_at: new Date(now).toISOString(), expires_at: new Date(now + 120000).toISOString() };
    locks.set(key, row); return [{ ...row }];
  };
  const sql = async (strings, ...v) => {
    const q = strings.join(''); queries.push(q);
    if (q.includes('SELECT setting_value FROM app_settings')) return [{setting_value:{events:[{id:'event-x'},{id:'event-a'},{id:'event-b'}],cashier:[{id:station,name:'Caisse 1',type:'cashier',active:true}],kitchen:[{id:station,name:'Cuisine 1',type:'kitchen',active:true}]}}];
    assert.doesNotMatch(q, /CREATE TABLE|ALTER TABLE/, 'No runtime schema changes');
    if (q.includes('INSERT INTO cashier_event_locks')) {
      // Model the single PostgreSQL statement, with no async SELECT/write gap.
      assert.match(q, /ON CONFLICT \(event_name\) DO UPDATE/);
      assert.match(q, /WHERE cashier_event_locks.expires_at <= NOW\(\) OR cashier_event_locks.user_id = EXCLUDED.user_id/);
      assert.match(q, /FOR SHARE OF s, u/);
      const [hash, userId, eventId, workstationId, , , legacyKey, key, owner, username] = v, old = locks.get(key);
      if (!valid(hash, userId, eventId) || sessions.get(hash).user.workstation_id !== workstationId || (locks.get(legacyKey) && Date.parse(locks.get(legacyKey).expires_at)>now) || (old && Date.parse(old.expires_at) > now && old.user_id !== owner)) return [];
      return renewed(key, owner, username);
    }
    if (q.includes('UPDATE cashier_event_locks')) {
      assert.doesNotMatch(q, /INSERT|ON CONFLICT/);
      assert.match(q, /EXISTS \(SELECT 1 FROM authorized_session\)/);
      assert.match(q, /FOR SHARE OF s, u/);
      const [hash, userId, eventId, workstationId, , , , key, owner] = v, old = locks.get(key);
      if (!valid(hash, userId, eventId) || sessions.get(hash).user.workstation_id !== workstationId || !old || old.user_id !== owner || Date.parse(old.expires_at) <= now) return [];
      return renewed(key, owner, old.username);
    }
    if (q.includes('SELECT username, heartbeat_at')) {
      const old = locks.get(v[0]); return old && Date.parse(old.expires_at) > now ? [{ ...old }] : [];
    }
    if (q.includes('DELETE FROM cashier_event_locks')) {
      if (q.includes('split_part')) {
        for (const [key, row] of locks) if (row.user_id.split(':')[1] === v[0]) locks.delete(key);
      } else if (locks.get(v[0])?.user_id === v[1]) locks.delete(v[0]);
      return [];
    }
    if (q.includes('UPDATE staff_sessions')) { const s = sessions.get(v[0]); if (s) s.revoked = true; return []; }
    if (q.includes('FROM staff_sessions s JOIN')) {
      const s = sessions.get(v[0]);
      const rows = s && !s.revoked && s.expires > now && s.user.active ? [{ ...s.user }] : [];
      afterAuthorization?.();
      return rows;
    }
    throw Error('Unexpected mock SQL: ' + q);
  };
  const mocks = {
    '@/lib/db': { sql },
    '@/lib/menu-settings': { getStoreConfig: async () => ({ events: [{ id: 'event-a', name: 'testmaison' }, { id: 'event-b', name: 'testmaison' }] }) },
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  };
  const cache = new Map();
  const api = load('src/app/api/cashier-lock/route.ts', mocks, cache);
  const staff = load('src/app/api/staff/session/route.ts', mocks, cache);
  const request = (action = 'acquire', { token = 'a', instanceId = instanceA, eventId = 'event-a', headers = {}, ...extra } = {}) => new Request('https://afro.test/api/cashier-lock', {
    method: 'POST', headers: { origin: 'https://afro.test', ...(token ? { cookie: `af_staff_session=${token.repeat(64)}` } : {}), ...headers },
    body: JSON.stringify({ action, eventId, instanceId, ...extra }),
  });
  return { locks, sessions, users, queries, api, staff, request, afterAuth: callback => { afterAuthorization = callback; }, advance: ms => { now += ms; }, session: token => sessions.get(digest(token.repeat(64))) };
}

for (const condition of ['absent', 'revoked', 'expired', 'kitchen', 'disabled']) {
  test(`lock rejects ${condition} session despite forged role/identity`, async () => {
    const h = fixture();
    const token = condition === 'absent' ? '' : condition === 'kitchen' ? 'd' : 'a';
    if (condition === 'revoked') h.session('a').revoked = true;
    if (condition === 'expired') h.advance(7200001);
    if (condition === 'disabled') h.users.get('a').active = false;
    for (const action of ['acquire', 'heartbeat', 'release']) {
      const res = await h.api.POST(h.request(action, { token, headers: { 'x-staff-role': 'admin' }, userId: 'admin-fixture', username: 'admin' }));
      assert.equal(res.status, condition === 'kitchen' ? 403 : 401);
    }
    assert.equal(h.locks.size, 0);
  });
}

for (const headers of [{ origin: 'https://evil.test' }, { 'sec-fetch-site': 'cross-site' }, { origin: '' }]) {
  test(`lock rejects browser origin ${JSON.stringify(headers)}`, async () => {
    const h = fixture();
    for (const action of ['acquire', 'heartbeat', 'release']) assert.equal((await h.api.POST(h.request(action, { headers }))).status, 403);
    assert.equal(h.queries.length, 0);
  });
}

test('forged client identity is ignored; server owner is bound to session and instance and never exposed', async () => {
  const h = fixture();
  const response = await h.api.POST(h.request('acquire', { headers: { 'x-staff-role': 'admin' }, userId: 'admin-fixture', username: 'fake' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.lock.username, 'louka');
  assert.doesNotMatch(JSON.stringify(body), /sessionHash|userId|fake|v2:/);
  assert.ok(h.locks.get(lockKey('event-a')).user_id.includes(digest('a'.repeat(64))));
  assert.equal((await h.api.POST(h.request('heartbeat', { token: 'b' }))).status, 409);
  await h.api.POST(h.request('release', { token: 'b', userId: 'louka-fixture' }));
  assert.equal(h.locks.size, 1);
});

test('cashier and operational admin use only their server-assigned stable event', async () => {
  const h = fixture();
  assert.equal((await h.api.POST(h.request('acquire', { eventId: 'event-b' }))).status, 403);
  assert.equal((await h.api.POST(h.request('acquire', { token: 'c', eventId: 'missing' }))).status, 403);
  assert.equal((await h.api.POST(h.request('acquire', { token: 'c', eventId: '' }))).status, 403);
  h.users.get('c').cashier_event_id = 'event-b';
  assert.equal((await h.api.POST(h.request('acquire', { token: 'c', eventId: 'event-b' }))).status, 200);
  assert.equal((await h.api.POST(h.request('acquire'))).status, 200);
  assert.equal(h.locks.size, 2, 'Identically named events have distinct ID keys');
  h.users.get('c').cashier_event_id = 'event-a';
  assert.equal((await h.api.POST(h.request('acquire', { token: 'c' }))).status, 423, 'No admin takeover');
  h.users.get('a').cashier_event_id = null;
  assert.equal((await h.api.POST(h.request('acquire'))).status, 403);
});

test('unknown actions, malformed instances and missing stable admin event are refused', async () => {
  const h = fixture();
  for (const action of ['unknown', '', null]) assert.equal((await h.api.POST(h.request(action))).status, 400);
  assert.equal((await h.api.POST(h.request('acquire', { instanceId: 'invented' }))).status, 400);
  assert.equal(h.locks.size, 0);
});

test('two concurrent acquisitions grant exactly one holder; same live lease is idempotent; another tab is blocked', async () => {
  const h = fixture();
  const results = await Promise.all([h.api.POST(h.request()), h.api.POST(h.request('acquire', { token: 'b', instanceId: instanceB }))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 423]);
  assert.equal(h.locks.size, 1);
  assert.equal((await h.api.POST(h.request())).status, 200);
  assert.equal((await h.api.POST(h.request('acquire', { instanceId: instanceB }))).status, 423);
  assert.equal((await h.api.POST(h.request('heartbeat', { instanceId: instanceB }))).status, 409);
  assert.equal((await h.api.POST(h.request('heartbeat'))).status, 200);
});

for (const newHolder of [false, true]) {
  test(`expired lease return uses acquisition and preserves a new legitimate holder, newHolder=${newHolder}`, async () => {
    const h = fixture();
    assert.equal((await h.api.POST(h.request())).status, 200);
    h.advance(120001);
    if (newHolder) assert.equal((await h.api.POST(h.request('acquire', { token: 'b', instanceId: instanceB }))).status, 200);
    const returned = await h.api.POST(h.request('acquire'));
    assert.equal(returned.status, newHolder ? 423 : 200);
    const body = await returned.json();
    if (newHolder) {
      assert.equal(body.error, 'cashier_locked');
      assert.equal(body.lock.username, 'cem');
      assert.equal(h.locks.get(lockKey('event-a')).username, 'cem');
    } else {
      assert.equal(body.ok, true);
      assert.equal(body.lock.username, 'louka');
    }
  });
}

test('heartbeat without acquisition, after expiration or release never creates a lock', async () => {
  const h = fixture();
  assert.equal((await h.api.POST(h.request('heartbeat'))).status, 409);
  assert.equal(h.locks.size, 0);
  await h.api.POST(h.request()); h.advance(120001);
  assert.equal((await h.api.POST(h.request('heartbeat'))).status, 409);
  assert.equal((await h.api.POST(h.request('acquire', { token: 'b', instanceId: instanceB }))).status, 200);
  await h.api.POST(h.request('release', { token: 'b', instanceId: instanceB }));
  assert.equal((await h.api.POST(h.request('heartbeat', { token: 'b', instanceId: instanceB }))).status, 409);
  assert.equal(h.locks.size, 0);
});

test('release permits immediate handover; a late release or heartbeat cannot delete or replace the new holder', async () => {
  const h = fixture(); await h.api.POST(h.request());
  await h.api.POST(h.request('release'));
  assert.equal((await h.api.POST(h.request('acquire', { token: 'b', instanceId: instanceB }))).status, 200);
  const owner = h.locks.get(lockKey('event-a')).user_id;
  await h.api.POST(h.request('release'));
  assert.equal((await h.api.POST(h.request('heartbeat'))).status, 409);
  assert.equal((await h.api.POST(h.request())).status, 423);
  assert.equal(h.locks.get(lockKey('event-a')).user_id, owner);
});

test('logout revokes before lease cleanup, preserves other sessions and prevents late recreation', async () => {
  const h = fixture();
  await h.api.POST(h.request());
  h.users.get('c').cashier_event_id = 'event-b';
  await h.api.POST(h.request('acquire', { token: 'c', eventId: 'event-b' }));
  const response = await h.staff.DELETE(new Request('https://afro.test/api/staff/session', { method: 'DELETE', headers: { origin: 'https://afro.test', cookie: `af_staff_session=${'a'.repeat(64)}` } }));
  assert.equal(response.status, 200);
  assert.equal(h.session('a').revoked, true);
  assert.equal(h.locks.has(lockKey('event-a')), false);
  assert.equal(h.locks.has(lockKey('event-b')), true);
  assert.ok(h.queries.findIndex(q => q.includes('UPDATE staff_sessions')) < h.queries.findIndex(q => q.includes('split_part')));
  for (const action of ['acquire', 'heartbeat']) assert.equal((await h.api.POST(h.request(action))).status, 401);
  assert.equal((await h.api.POST(h.request('acquire', { token: 'b' }))).status, 200);
});

test('a session revoked between HTTP authorization and the write cannot acquire or renew', async () => {
  const h = fixture();
  h.afterAuth(() => { h.session('a').revoked = true; });
  assert.notEqual((await h.api.POST(h.request())).status, 200);
  assert.equal(h.locks.size, 0);
  const other = fixture();
  await other.api.POST(other.request());
  const expiry = other.locks.get(lockKey('event-a')).expires_at;
  other.advance(30000);
  other.afterAuth(() => { other.session('a').revoked = true; });
  assert.notEqual((await other.api.POST(other.request('heartbeat'))).status, 200);
  assert.equal(other.locks.get(lockKey('event-a')).expires_at, expiry);
});
