/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { load, harness, findAll } = require('./ui-harness.cjs');
const stationId = '11111111-1111-4111-8111-111111111111';
const admin = { id: 'admin', username: 'admin', role: 'admin', active: true, cashier_event_id: null, workstation_id: null };
const account = (role = 'cashier') => ({ id: 'papa-id', username: 'papa', role, active: true, cashier_event_id: 'a', workstation_id: stationId });
const workstation = (type = 'cashier', extra = {}) => ({ id: stationId, name: 'Ancien nom', type, active: true, ...extra });

// Offline transactional model. The production resolver and save API run unchanged;
// no DB/credentials/network. This does not simulate PostgreSQL lock scheduling.
function fixture(initial = []) {
  const users = new Map([admin, ...initial].map(u => [u.id, structuredClone(u)]));
  const settings = new Map(), revoked = new Set(), locks = new Set(initial.map(u => u.id));
  const orders = [{ id: 'old', created_by: 'papa-id', register_id: stationId, paid_by: 'papa-id', paid_register_id: stationId }];
  let beforeTransaction, failure, failuresLeft = 0;
  const queries = [], options = [];
  const sql = (strings, ...values) => ({ q: strings.join('?'), values,
    then(resolve, reject) { return Promise.resolve().then(() => execute(this)).then(resolve, reject); } });
  async function execute({ q, values: v }) {
    queries.push(q);
    if (q.includes('af_assert_staff_admin')) return [{ ok: true }];
    if (q.includes('WITH plans AS MATERIALIZED')) {
      const plans = JSON.parse(v[0]), create = v[1], username = v[2], id = v[4], previous = JSON.parse(v[5]);
      const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      if (create ? [...users.values()].some(u => u.username === username) : !equal(users.get(id), previous)) return [];
      if (plans.some(p => !equal(settings.get(p.key) ?? null, p.expected))) return [];
      if (plans.some(p => [...p.next.cashier, ...p.next.kitchen].some(s => s.ownerUserId === id && [...users.values()].some(u => u.id !== id && u.cashier_event_id === p.key.slice(13) && u.workstation_id === s.id)))) return [];
      const save = v.find(value => value?.q && /INSERT INTO staff_users|UPDATE staff_users/.test(value.q));
      assert.ok(save, 'mutation is composed as parameterized SQL');
      const x = save.values;
      const user = create ? { id: x[0], username: x[1], role: x[3], active: x[4], cashier_event_id: x[5], workstation_id: x[6] }
        : { ...users.get(id), role: x[0], active: x[1], cashier_event_id: x[2], workstation_id: x[3] };
      if (failure && failuresLeft-- > 0) throw failure;
      for (const p of plans) settings.set(p.key, structuredClone(p.next));
      users.set(user.id, user);
      if (!create) { revoked.add(id); locks.delete(id); }
      return [{ id: user.id }];
    }
    if (q.includes('SELECT id, username, role, active')) return structuredClone([...users.values()]);
    if (q.includes('SELECT setting_value')) return settings.has(v[0]) ? [{ setting_value: structuredClone(settings.get(v[0])) }] : [];
    if (q.includes('INSERT INTO app_settings')) {
      const old = settings.get(v[0]);
      if (old && JSON.stringify(old) !== v[2]) return [];
      settings.set(v[0], JSON.parse(v[1])); return [{ setting_key: v[0] }];
    }
    if (q.includes('UPDATE staff_sessions') || q.includes('DELETE FROM cashier_event_locks')) return [];
    throw Error('Unexpected SQL: ' + q);
  }
  sql.transaction = async (statements, opts) => {
    options.push(opts);
    if (beforeTransaction) { const fn = beforeTransaction; beforeTransaction = null; fn(); }
    const result = [];
    for (const statement of statements) result.push(await statement);
    return result;
  };
  const mocks = {
    '@/lib/db': { sql },
    '@/lib/staff-password': { hashStaffPassword: async () => 'scrypt-v1:fixture' },
    '@/lib/staff-session-server': { StaffAuthError: class extends Error { constructor(code, status = 401) { super(code); this.code = code; this.status = status; } }, requireStaffSession: async () => admin, requireStaffOrigin() {}, staffSessionHash: () => 'fixture' },
    '@/lib/menu-settings': { getStoreConfig: async () => ({ events: [{ id: 'a' }, { id: 'b' }] }) },
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
  };
  const cache = new Map(), api = load('src/app/api/staff/users/route.ts', mocks, cache);
  const save = async (body, create = false) => {
    const response = await api[create ? 'POST' : 'PATCH'](new Request('https://fixture.test/api/staff/users', { method: create ? 'POST' : 'PATCH', body: JSON.stringify(body) }));
    return { status: response.status, ...await response.json() };
  };
  const patch = extra => save({ id: 'papa-id', role: 'cashier', active: true, eventId: 'a', ...extra });
  return { users, settings, revoked, locks, orders, options, queries, mocks, save, patch,
    changeBeforeCommit: fn => { beforeTransaction = fn; }, failNext: (code, count = 1) => { failure = Object.assign(Error(code), { code }); failuresLeft = count; },
    stations: event => settings.get('workstations:' + event),
    stationApi: load('src/app/api/staff/workstations/route.ts', mocks, cache),
  };
}

for (const role of ['cashier', 'kitchen']) test(`new ${role}: server creates a stable owned UUID; names are not identity`, async () => {
  const f = fixture();
  f.settings.set('workstations:a', { cashier: [{ ...workstation(), name: 'Caisse papa' }], kitchen: [] });
  const result = await f.save({ username: 'papa', password: 'long-fixture-password', role, active: true, eventId: 'a', workstationId: stationId }, true);
  assert.equal(result.status, 200);
  const user = [...f.users.values()].find(u => u.username === 'papa');
  const station = f.stations('a')[role].find(s => s.ownerUserId === user.id);
  assert.match(station.id, /^[a-f0-9-]{36}$/); assert.notEqual(station.id, stationId);
  assert.equal(station.name, `${role === 'cashier' ? 'Caisse' : 'Cuisine'} papa`);
  assert.equal(user.workstation_id, station.id);
  assert.equal(f.options[0].isolationLevel, 'Serializable');
});

for (const role of ['cashier', 'kitchen']) test(`${role}: adopt current legacy assignment, switch role and return to the same UUID`, async () => {
  const f = fixture([account(role)]), other = role === 'cashier' ? 'kitchen' : 'cashier';
  f.settings.set('workstations:a', { cashier: [], kitchen: [], [role]: [workstation(role)] });
  const history = structuredClone(f.orders);
  assert.equal((await f.patch({ role: other })).status, 200);
  const otherId = f.users.get('papa-id').workstation_id;
  assert.notEqual(otherId, stationId);
  assert.equal(f.stations('a')[role][0].ownerUserId, 'papa-id');
  assert.equal((await f.patch({ role })).status, 200);
  assert.equal(f.users.get('papa-id').workstation_id, stationId);
  assert.equal((await f.patch({ role: other })).status, 200);
  assert.equal(f.users.get('papa-id').workstation_id, otherId);
  assert.deepEqual(f.orders, history); assert.ok(f.revoked.has('papa-id')); assert.ok(!f.locks.has('papa-id'));
});

test('event round trip retains both UUIDs, even after username changes', async () => {
  const f = fixture([account()]); f.settings.set('workstations:a', { cashier: [workstation()], kitchen: [] });
  assert.equal((await f.patch({ eventId: 'b' })).status, 200);
  const b = f.users.get('papa-id').workstation_id; assert.notEqual(b, stationId);
  f.users.get('papa-id').username = 'renamed';
  assert.equal((await f.patch()).status, 200); assert.equal(f.users.get('papa-id').workstation_id, stationId);
  assert.equal((await f.patch({ eventId: 'b' })).status, 200); assert.equal(f.users.get('papa-id').workstation_id, b);
});

test('Admin creation and edits always clear permanent event/workstation, including legacy client fields', async () => {
  const f = fixture([account()]);
  assert.equal((await f.patch({ role: 'admin', workstationId: stationId })).status, 200);
  assert.equal((await f.save({ username: 'second-admin', password: 'long-fixture-password', role: 'admin', active: true, eventId: 'a', workstationId: stationId }, true)).status, 200);
  for (const u of f.users.values()) { assert.equal(u.cashier_event_id, null); assert.equal(u.workstation_id, null); }
  assert.equal(f.settings.size, 0);
});

for (const [extra, code] of [[{ ownerUserId: 'maman-id' }, 'workstation_owner_conflict'], [{ active: false, ownerUserId: 'papa-id' }, 'workstation_inactive']]) {
  test(`unsafe legacy/owned station is refused: ${code}`, async () => {
    const f = fixture([account()]); f.settings.set('workstations:a', { cashier: [workstation('cashier', extra)], kitchen: [] });
    const before = structuredClone([...f.settings]);
    const result = await f.patch({ role: 'kitchen' }); assert.equal(result.status, 409); assert.equal(result.error, code);
    assert.deepEqual([...f.settings], before); assert.equal(f.users.get('papa-id').role, 'cashier'); assert.equal(f.revoked.size, 0);
  });
}

test('shared legacy station and duplicate owned stations fail closed', async () => {
  const f = fixture([account(), { ...account(), id: 'peer', username: 'peer' }]);
  f.settings.set('workstations:a', { cashier: [workstation()], kitchen: [] });
  assert.equal((await f.patch()).error, 'workstation_shared_assignment');
  f.users.delete('peer');
  f.stations('a').cashier.push(workstation('cashier', { id: '22222222-2222-4222-8222-222222222222', ownerUserId: 'papa-id' }));
  f.stations('a').cashier[0].ownerUserId = 'papa-id';
  assert.equal((await f.patch()).error, 'workstation_owner_ambiguous');
});

test('rename preserves ownership and UUID; body cannot replace ownerUserId', async () => {
  const f = fixture(); f.settings.set('workstations:a', { cashier: [workstation('cashier', { ownerUserId: 'papa-id' })], kitchen: [] });
  const response = await f.stationApi.PATCH(new Request('https://fixture.test', { method: 'PATCH', body: JSON.stringify({ id: stationId, eventId: 'a', type: 'cashier', name: 'Renamed', active: true, ownerUserId: 'forged' }) }));
  assert.equal(response.status, 200); assert.equal(f.stations('a').cashier[0].ownerUserId, 'papa-id'); assert.equal(f.stations('a').cashier[0].id, stationId);
});

test('stale JSON/user snapshot, new peer and concurrent duplicate username write nothing', async () => {
  for (const race of ['config', 'user', 'peer', 'username']) {
    const f = fixture([account()]); f.settings.set('workstations:a', { cashier: [workstation()], kitchen: [] });
    f.changeBeforeCommit(() => {
      if (race === 'config') f.stations('a').cashier[0].name = 'Concurrent edit';
      if (race === 'user') f.users.get('papa-id').active = false;
      if (race === 'peer') f.users.set('peer', { ...account(), id: 'peer', username: 'peer' });
      if (race === 'username') f.users.set('new', { ...account(), id: 'new', username: 'new' });
    });
    const result = race === 'username' ? await f.save({ username: 'new', password: 'long-fixture-password', role: 'kitchen', active: true, eventId: 'a' }, true) : await f.patch({ role: 'kitchen' });
    assert.equal(result.status, 409); assert.equal(f.stations('a').kitchen.length, 0); assert.equal(f.revoked.size, 0);
  }
});

test('serialization abort retries the complete guarded transaction; exhausted conflicts fail closed', async () => {
  const f = fixture([account()]); f.settings.set('workstations:a', { cashier: [workstation()], kitchen: [] });
  f.failNext('40001'); assert.equal((await f.patch({ role: 'kitchen' })).status, 200);
  assert.equal(f.options.length, 2); assert.equal(f.stations('a').kitchen.length, 1);
  const blocked = fixture([account()]); blocked.settings.set('workstations:a', { cashier: [workstation()], kitchen: [] });
  blocked.failNext('40001', 3); assert.equal((await blocked.patch({ role: 'kitchen' })).status, 409);
  assert.equal(blocked.options.length, 3); assert.equal(blocked.stations('a').kitchen.length, 0);
  assert.equal(blocked.users.get('papa-id').role, 'cashier'); assert.equal(blocked.revoked.size, 0);
});

test('different users receive distinct registers/kitchens on the same event', async () => {
  const f = fixture();
  for (const [username, role] of [['papa', 'cashier'], ['maman', 'cashier'], ['Cem', 'kitchen'], ['Louka', 'kitchen']]) {
    assert.equal((await f.save({ username, password: 'long-fixture-password', role, active: true, eventId: 'a' }, true)).status, 200);
  }
  const config = f.stations('a'), all = [...config.cashier, ...config.kitchen];
  assert.equal(config.cashier.length, 2); assert.equal(config.kitchen.length, 2);
  assert.equal(new Set(all.map(s => s.id)).size, 4); assert.equal(new Set(all.map(s => s.ownerUserId)).size, 4);
});

test('user form contains role/event/active and no manual workstation field', () => {
  const f = fixture();
  const h = harness('src/app/staff/admin/users/page.tsx', { loading: false, adminEventId: 'a', events: [{ id: 'a', name: 'Festival A' }], users: [] }, { ...f.mocks, '@/lib/staff-auth': { getSession: () => ({ role: 'admin' }), getStaffRoleLabel: role => role } });
  const form = findAll(h.render(), n => n.type === 'form')[0];
  assert.equal(findAll(form, n => n.type === 'select').length, 2);
  assert.equal('workstationId' in h.state.draft, false);
  assert.equal(findAll(form, n => n.type === 'input' && n.props.type === 'checkbox').length, 1);
});
