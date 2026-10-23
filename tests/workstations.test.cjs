/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { load, harness, findAll } = require('./ui-harness.cjs');
const station1 = '11111111-1111-4111-8111-111111111111', station2 = '22222222-2222-4222-8222-222222222222';
const kitchen1 = '33333333-3333-4333-8333-333333333333', kitchen2 = '44444444-4444-4444-8444-444444444444';
const instance = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hash = value => createHash('sha256').update(value).digest('hex');

// Offline row/transaction model: the actual routes, auth, lease key construction,
// attribution helpers and admin validation run unchanged. No database connection.
function fixture() {
  let now = Date.now(), tail = Promise.resolve(), orderSequence = 0;
  const users = new Map([
    ['a', { id: 'cem', username: 'cem', role: 'cashier', active: true, cashier_event_id: 'event-a', workstation_id: station1 }],
    ['b', { id: 'louka', username: 'louka', role: 'cashier', active: true, cashier_event_id: 'event-a', workstation_id: station2 }],
    ['c', { id: 'admin', username: 'admin', role: 'admin', active: true, cashier_event_id: null, workstation_id: null }],
    ['d', { id: 'jessica', username: 'jessica', role: 'kitchen', active: true, cashier_event_id: 'event-a', workstation_id: kitchen1 }],
    ['e', { id: 'tshansia', username: 'tshansia', role: 'kitchen', active: true, cashier_event_id: 'event-a', workstation_id: kitchen2 }],
    ['f', { id: 'peer', username: 'peer', role: 'cashier', active: true, cashier_event_id: 'event-a', workstation_id: station1 }],
  ]);
  const sessions = new Map([...users].map(([token, user]) => [hash(token.repeat(64)), { user, revoked: false }]));
  const settings = new Map([
    ['store_config', { events: [{ id: 'event-a', name: 'Event A' }, { id: 'event-b', name: 'Event B' }] }],
    ['workstations:event-a', { cashier: [{ id: station1, name: 'Caisse 1', type: 'cashier', active: true }, { id: station2, name: 'Caisse 2', type: 'cashier', active: true }], kitchen: [{ id: kitchen1, name: 'Cuisine 1', type: 'kitchen', active: true }, { id: kitchen2, name: 'Cuisine 2', type: 'kitchen', active: true }] }],
  ]);
  const locks = new Map(), orders = new Map(), queries = [];
  function valid(sessionHash, userId) { const s = sessions.get(sessionHash); if (!s || s.revoked || !s.user.active || s.user.id !== userId) throw Error('revoked'); return s.user; }
  function assignment(user, event, station) {
    const config = settings.get('workstations:' + event), item = [...(config?.cashier || []), ...(config?.kitchen || [])].find(s => s.id === station);
    if (user.cashier_event_id !== event || user.workstation_id !== station || !item?.active || item.type !== user.role) throw Error('assignment');
  }
  async function execute(q, v) {
    queries.push(q);
    if (q.includes('INSERT INTO orders')) {
      if (q.includes('pos_cash_key') || q.includes('pos_card_key')) {
        const card = q.includes('pos_card_key');
        if ([...orders.values()].some(row => row.pos_cash_key === v[5] || row.pos_card_key === v[5])) return [];
        const row = { id: v[0], event_id: v[1], event_name: v[2], payment: card ? 'card' : 'cash', amount_cents: v[3], items: JSON.parse(v[4]), status: 'PENDING_PAYMENT', quantity_applied: false,
          created_by: card ? v[9] : v[7], created_by_username: card ? v[10] : v[8], register_id: card ? v[11] : v[9], register_name: card ? v[12] : v[10],
          ...(card ? { pos_card_key:v[5], pos_card_fingerprint:v[6], pos_card_state:'creating' } : { pos_cash_key:v[5], pos_cash_fingerprint:v[6], pos_cash_state:'creating' }) };
        orders.set(row.id, row); return [{...row}];
      }
      orders.set(v[0], {id:v[0],event_id:v[3],payment:v[7],created_by:null,register_id:null,status:'PENDING_PAYMENT'}); return [];
    }
    if (q.includes('WHERE pos_cash_key') || q.includes('WHERE pos_card_key')) return [...orders.values()].filter(row => row.pos_cash_key === v[0] || row.pos_card_key === v[0]).map(row => ({...row}));
    if (q.includes("SET pos_cash_state = 'ready'") || q.includes("SET pos_card_state = 'ready'")) {
      const row=orders.get(v[0]); row[q.includes('pos_cash_state')?'pos_cash_state':'pos_card_state']='ready';return [{...row}];
    }
    if (q.includes('pg_advisory_xact_lock')) return [];
    if (q.includes('WITH candidate AS MATERIALIZED')) {
      const row=orders.get(v[0]); if (!row || row.paid_at || row.status !== 'PENDING_PAYMENT') return [];
      Object.assign(row,{status:'NEW',paid_at:new Date(now).toISOString(),quantity_applied:true});
      if (v[14] !== 'card') Object.assign(row,{paid_by:v[2],paid_by_username:v[4],paid_register_id:v[6],paid_register_name:v[8]});
      return [{id:row.id}];
    }
    if (q.includes('SELECT * FROM orders WHERE id')) return orders.has(v[0]) ? [{...orders.get(v[0])}] : [];
    if (q.includes('SELECT setting_value')) return settings.has(v[0] || 'store_config') ? [{ setting_value: structuredClone(settings.get(v[0] || 'store_config')) }] : [];
    if (q.includes('SELECT u.id, u.username')) { const s = sessions.get(v[0]); return s && !s.revoked && s.user.active ? [{ ...s.user }] : []; }
    if (q.includes('af_assert_staff_admin')) { if (valid(v[0], v[1]).role !== 'admin') throw Error('admin'); return [{ ok: true }]; }
    if (q.includes('af_assert_cashier_lease')) {
      const user = valid(v[0], v[1]); assignment(user, v[2], v[3]);
      const lock = locks.get(v[4]); if (!lock || lock.user_id !== v[5] || lock.expires <= now) throw Error('lease'); return [{ authorized: true }];
    }
    if (q.includes('INSERT INTO cashier_event_locks')) {
      const [sessionHash, userId, event, station, , , legacy, key, owner, username] = v;
      try { assignment(valid(sessionHash, userId), event, station); } catch { return []; }
      const previous = locks.get(key);
      if (locks.get(legacy)?.expires > now || previous && previous.expires > now && previous.user_id !== owner) return [];
      const row = { username, user_id: owner, heartbeat_at: new Date(now).toISOString(), expires_at: new Date(now + 120000).toISOString(), expires: now + 120000 };
      locks.set(key, row); return [{ ...row }];
    }
    if (q.includes('UPDATE cashier_event_locks')) {
      const [sessionHash, userId, event, station, , , , key, owner] = v;
      try { assignment(valid(sessionHash, userId), event, station); } catch { return []; }
      const row = locks.get(key); if (!row || row.user_id !== owner || row.expires <= now) return [];
      row.expires = now + 120000; row.expires_at = new Date(row.expires).toISOString(); return [{ ...row }];
    }
    if (q.includes('SELECT username, heartbeat_at')) { const row = locks.get(v[0]); return row?.expires > now ? [{ ...row }] : []; }
    if (q.includes('DELETE FROM cashier_event_locks')) {
      if (q.includes('split_part')) {
        const id = q.includes('workstation_id') ? [...users.values()].filter(u => u.cashier_event_id === v[1] && u.workstation_id === v[2]).map(u => u.id) : [v[0]];
        for (const [key, row] of locks) { const s = sessions.get(row.user_id.split(':')[1]); if (q.includes('SELECT token_hash') ? id.includes(s?.user.id) : row.user_id.split(':')[1] === v[0]) locks.delete(key); }
      } else if (locks.get(v[0])?.user_id === v[1]) locks.delete(v[0]);
      return [];
    }
    if (q.includes('UPDATE staff_sessions')) {
      for (const [token, s] of sessions) if (q.includes('WHERE user_id =') ? s.user.id === v[0] : q.includes('workstation_id') ? v[0] && s.user.cashier_event_id === v[1] && s.user.workstation_id === v[2] : token === v[0]) s.revoked = true;
      return [];
    }
    if (q.includes('SELECT id, username, role, active')) return [...users.values()].map(({id,username,role,active,cashier_event_id,workstation_id}) => ({id,username,role,active,cashier_event_id,workstation_id}));
    if (q.includes('SELECT id FROM staff_users WHERE username')) return [...users.values()].filter(u => u.username === v[0]).map(u => ({ id: u.id }));
    if (q.includes('UPDATE staff_users')) { const u = [...users.values()].find(u => u.id === v[4]); if (!u) return []; Object.assign(u, { role: v[0], active: v[1], cashier_event_id: v[2], workstation_id: v[3] }); return [{ id: u.id }]; }
    if (q.includes('INSERT INTO staff_users')) { if ([...users.values()].some(u => u.username === v[1])) return []; const u = { id: v[0], username: v[1], password_hash: v[2], role: v[3], active: v[4], cashier_event_id: v[5], workstation_id: v[6] }; users.set(u.id, u); return [{ id: u.id }]; }
    if (q.includes('INSERT INTO app_settings')) { const old = settings.get(v[0]); if (old && JSON.stringify(old) !== v[2]) return []; settings.set(v[0], JSON.parse(v[1])); return [{ setting_key: v[0] }]; }
    if (q.includes('paid_by = COALESCE')) {
      const row = orders.get(v[4]); if (!row || row.event_id !== v[5] || row.paid_at || row.paid_by && (row.paid_by !== v[6] || row.paid_register_id !== v[7])) return [];
      if (!row.paid_by) Object.assign(row, { paid_by: v[0], paid_by_username: v[1], paid_register_id: v[2], paid_register_name: v[3] }); return [{ id: row.id }];
    }
    if (q.includes('INSERT INTO staff_action_audit')) return [];
    if (q.includes('FROM orders WHERE event_id')) return [...orders.values()].filter(row => row.event_id === v[0] && row.status === v[1]);
    throw Error('Unexpected SQL: ' + q);
  }
  const sql = (strings, ...values) => ({ q: strings.join(''), values, then(resolve, reject) { return Promise.resolve().then(() => execute(this.q, values)).then(resolve, reject); } });
  sql.transaction = statements => { const result = tail.then(async () => { const results = []; for (const statement of statements) results.push(await statement); return results; }); tail = result.catch(() => {}); return result; };
  const mocks = { '@/lib/db': { sql }, '@/lib/orders-schema': {ensureOrdersSchema:async()=>{}}, '@/lib/order-number':{makeNextOrderId:async()=>`order-${++orderSequence}`}, '@/lib/order-events':{publishOrderEvent:()=>{}},
    '@/lib/menu-settings': { getStoreConfig: async () => settings.get('store_config'), ensureMenuSettingsSchema:async()=>{},getPaymentConfig:async()=>({cashEnabled:true,cardEnabled:true}),getResolvedMenuSections:async()=>[{id:'food',items:[{id:'meal',name:{de:'Meal'},price:10,visible:true}]}] }, 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } } };
  const cache = new Map();
  const api = file => load(file, mocks, cache);
  const req = (token, body = {}, options = {}) => new Request('https://afro.test/api/test', { method: options.method || 'POST', headers: { cookie: `af_staff_session=${token.repeat(64)}`, origin: 'https://afro.test', 'x-cashier-instance-id': instance, ...options.headers }, ...(options.method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  const lease = (token, action = 'acquire', extra = {}) => api('src/app/api/cashier-lock/route.ts').POST(req(token, { action, instanceId: instance, ...extra }));
  return { api, req, lease, users, sessions, settings, locks, orders, queries, advance: ms => { now += ms; } };
}

test('Cem/Caisse 1 and Louka/Caisse 2 run concurrently; a peer on Caisse 1 is refused', async () => {
  const h = fixture(); const results = await Promise.all([h.lease('a'), h.lease('b')]);
  assert.deepEqual(results.map(r => r.status), [200, 200]); assert.equal(h.locks.size, 2);
  const peer = await h.lease('f'); assert.equal(peer.status, 423); assert.equal((await peer.json()).lock.username, 'cem');
  assert.equal((await h.lease('a', 'heartbeat')).status, 200);
  assert.equal((await h.lease('a', 'release')).status, 200);
  assert.equal((await h.lease('f')).status, 200);
});
test('TTL and legacy v2 lease prevent contradictory ownership during transition', async () => {
  const h = fixture(); h.locks.set('v2:event-a', { expires: Date.now() + 120000 });
  assert.equal((await h.lease('a')).status, 423); h.advance(120001);
  assert.equal((await h.lease('a')).status, 200); h.advance(120001);
  assert.equal((await h.lease('f')).status, 200); assert.equal((await h.lease('a', 'heartbeat')).status, 409);
});
for (const token of ['a', 'd']) test(`spoofed admin headers cannot administer users or workstations: ${token}`, async () => {
  const h = fixture();
  for (const file of ['users', 'workstations']) {
    const response = await h.api(`src/app/api/staff/${file}/route.ts`).POST(h.req(token, { role: 'admin', userId: 'admin' }, { headers: { 'x-staff-role': 'admin' } }));
    assert.equal(response.status, 403);
  }
});
for (const patch of [{ workstationId: kitchen1 }, { eventId: 'event-b', workstationId: station1 }, { workstationId: station2, inactive: true }]) test(`admin rejects incompatible assignment ${JSON.stringify(patch)}`, async () => {
  const h = fixture(); if (patch.inactive) h.settings.get('workstations:event-a').cashier[1].active = false;
  const response = await h.api('src/app/api/staff/users/route.ts').PATCH(h.req('c', { id: 'cem', role: 'cashier', active: true, eventId: 'event-a', workstationId: station1, ...patch }));
  assert.equal(response.status, 400); assert.equal(h.users.get('a').workstation_id, station1);
});
test('admin reassignment revokes old sessions and releases only the affected leases', async () => {
  const h = fixture(); await h.lease('a'); await h.lease('b');
  const response = await h.api('src/app/api/staff/users/route.ts').PATCH(h.req('c', { id: 'cem', role: 'cashier', active: true, eventId: 'event-a', workstationId: station2 }));
  assert.equal(response.status, 200); assert.equal(h.users.get('a').workstation_id, station2);
  assert.equal((await h.lease('a', 'heartbeat')).status, 401); assert.equal(h.locks.size, 1);
  assert.equal((await h.lease('b', 'heartbeat')).status, 200);
});
test('admin workstation rename preserves its UUID; deactivation revokes the assigned user', async () => {
  const h = fixture(); await h.lease('a'); const api = h.api('src/app/api/staff/workstations/route.ts');
  assert.equal((await api.PATCH(h.req('c', { eventId: 'event-a', id: station1, name: 'Accueil', type: 'cashier', active: true }))).status, 200);
  assert.equal(h.settings.get('workstations:event-a').cashier[0].id, station1);
  assert.equal((await api.PATCH(h.req('c', { eventId: 'event-a', id: station1, name: 'Accueil', type: 'cashier', active: false }))).status, 200);
  assert.equal((await h.lease('a')).status, 401); assert.equal(h.locks.size, 0);
});
test('admin creates a hashed server account; responses do not disclose credentials', async () => {
  const h = fixture(), api = h.api('src/app/api/staff/users/route.ts');
  assert.equal((await api.POST(h.req('c', { username: 'new-staff', password: 'fixture-password-only', role: 'kitchen', active: true, eventId: 'event-a', workstationId: kitchen1 }))).status, 200);
  const user = [...h.users.values()].find(u => u.username === 'new-staff'); assert.match(user.password_hash, /^scrypt-v1:/);
  const listed = await api.GET(h.req('c', {}, {method:'GET'}));
  assert.doesNotMatch(JSON.stringify(await listed.json()), /password_hash|scrypt-v1|fixture-password-only/);
  assert.doesNotMatch(h.queries.find(q => q.includes('SELECT id, username, role, active')), /password_hash/);
});
test('admin mutations reject a foreign origin before touching data', async () => {
  const h = fixture(); const response = await h.api('src/app/api/staff/users/route.ts').PATCH(h.req('c', {}, { headers: { origin: 'https://evil.test' } }));
  assert.equal(response.status, 403); assert.equal(h.queries.length, 0);
});
for (const body of [{ eventId: 'event-b' }, { workstationId: station2 }]) test(`lease rejects forged context ${JSON.stringify(body)}`, async () => {
  const h = fixture(); assert.equal((await h.lease('a', 'acquire', body)).status, 403);
});
test('sensitive POS authorization requires a live owner-bound lease, not a role header', async () => {
  const h = fixture(), guard = h.api('src/lib/cashier-write-context.ts');
  await assert.rejects(guard.requireCashierWrite(h.req('a'), 'event-a'), /cashier_lease_required/);
  await h.lease('a'); const context = await guard.requireCashierWrite(h.req('a'), 'event-a');
  assert.equal(context.userId, 'cem'); assert.equal(context.workstationId, station1);
  await assert.rejects(guard.requireCashierWrite(h.req('a'), 'event-b'), /forbidden/);
  await assert.rejects(guard.requireCashierWrite(h.req('a'), 'event-a', station2), /workstation_context_mismatch/);
  await assert.rejects(guard.requireCashierWrite(h.req('f'), 'event-a'), /cashier_lease_required/);
  h.advance(120001); await assert.rejects(guard.requireCashierWrite(h.req('a'), 'event-a'), /cashier_lease_required/);
});
test('card cashier reservation comes from the server, survives rename, and refuses reassignment', async () => {
  const h = fixture(), guard = h.api('src/lib/cashier-write-context.ts'); await h.lease('a'); await h.lease('b');
  h.orders.set('public', { id: 'public', event_id: 'event-a', payment: 'card', status: 'PENDING_PAYMENT', created_by: null });
  const a = await guard.requireCashierWrite(h.req('a'), 'event-a'); await guard.reserveCardCashier('public', a);
  h.users.get('a').username = 'renamed'; await guard.reserveCardCashier('public', { ...a, username: 'renamed' });
  assert.equal(h.orders.get('public').paid_by_username, 'cem'); assert.equal(h.orders.get('public').created_by, null);
  const b = await guard.requireCashierWrite(h.req('b'), 'event-a'); await assert.rejects(guard.reserveCardCashier('public', b), /mismatch/);
});
test('two kitchens share event orders without any cashier lease and cannot read another event', async () => {
  const h = fixture(); h.orders.set('sale', { id: 'sale', event_id: 'event-a', status: 'NEW' }); const api = h.api('src/app/api/staff/orders/route.ts');
  for (const token of ['d', 'e']) {
    const response = await api.GET(new Request('https://afro.test/api/staff/orders?eventId=event-a&status=NEW', { headers: h.req(token).headers }));
    assert.equal(response.status, 200); assert.equal((await response.json())[0].id, 'sale');
    assert.equal((await api.GET(new Request('https://afro.test/api/staff/orders?eventId=event-b', { headers: h.req(token).headers }))).status, 403);
  }
  assert.equal(h.locks.size, 0);
});
for (const change of ['missing', 'inactive', 'wrong-type']) test(`kitchen blocks invalid assignment: ${change}`, async () => {
  const h = fixture(); if (change === 'missing') h.users.get('d').workstation_id = null;
  if (change === 'inactive') h.settings.get('workstations:event-a').kitchen[0].active = false;
  if (change === 'wrong-type') h.users.get('d').workstation_id = station1;
  const response = await h.api('src/app/api/staff/orders/route.ts').GET(new Request('https://afro.test/api/staff/orders', { headers: h.req('d').headers }));
  assert.equal(response.status, 403); assert.equal(h.locks.size, 0);
});

test('POS creation snapshots creator/register, another cashier can encash, retries preserve both identities', async () => {
  const h=fixture(); await h.lease('a'); await h.lease('b'); const api=h.api('src/app/api/orders/route.ts');
  const body={eventId:'event-a',workstationId:station1,payment:'cash',posCashKey:instance,items:[{id:'meal',qty:1}],userId:'forged',username:'forged'};
  assert.equal((await api.POST(h.req('a',body))).status,200);
  let row=[...h.orders.values()][0]; assert.equal(row.created_by,'cem');assert.equal(row.created_by_username,'cem');assert.equal(row.register_id,station1);
  h.users.get('a').username='cem-renamed';assert.equal((await api.POST(h.req('a',body))).status,200);assert.equal(row.created_by_username,'cem');
  const guard=h.api('src/lib/cashier-write-context.ts'), finalize=h.api('src/lib/finalize-sale.ts');
  const b=await guard.requireCashierWrite(h.req('b'),'event-a'); await finalize.finalizeSale(row.id,{payment:'cash',received:1000},b);
  row=h.orders.get(row.id);assert.equal(row.paid_by,'louka');assert.equal(row.paid_register_id,station2);assert.equal(row.created_by,'cem');
  const a=await guard.requireCashierWrite(h.req('a'),'event-a');await finalize.finalizeSale(row.id,{payment:'cash',received:1000},a);
  assert.equal(row.paid_by,'louka');assert.equal(row.paid_by_username,'louka');
});
test('POS route refuses absent leases and forged event/workstation before creating an order',async()=>{
  const h=fixture(),api=h.api('src/app/api/orders/route.ts'),body={eventId:'event-a',workstationId:station1,payment:'cash',posCashKey:instance,items:[{id:'meal',qty:1}]};
  assert.equal((await api.POST(h.req('a',body))).status,423);await h.lease('a');
  assert.equal((await api.POST(h.req('a',{...body,eventId:'event-b'}))).status,403);
  assert.equal((await api.POST(h.req('a',{...body,workstationId:station2}))).status,403);assert.equal(h.orders.size,0);
});
test('public order keeps an anonymous creator; later cashier payment records the real encasher',async()=>{
  const h=fixture(),api=h.api('src/app/api/orders/route.ts');
  const response=await api.POST(new Request('https://afro.test/api/orders',{method:'POST',body:JSON.stringify({eventId:'event-a',payment:'cash',items:[{id:'meal',qty:1}],userId:'forged',username:'forged'})}));
  assert.equal(response.status,200);const row=[...h.orders.values()][0];assert.equal(row.created_by,null);assert.equal(row.register_id,null);
  await h.lease('b');const c=await h.api('src/lib/cashier-write-context.ts').requireCashierWrite(h.req('b'),'event-a');
  await h.api('src/lib/finalize-sale.ts').finalizeSale(row.id,{payment:'cash',received:1000},c);assert.equal(row.paid_by,'louka');assert.equal(row.created_by,null);
});

test('unassigned admin cannot access native terminal credentials or cashier history', async () => {
  const h = fixture();
  const auth = h.api('src/lib/staff-session-server.ts');
  await assert.rejects(auth.requireAssignedCashRegister(h.req('c')), error => error.code === 'workstation_assignment_required');
  const response = await h.api('src/app/api/orders/history/route.ts').GET(new Request('https://afro.test/api/orders/history?eventId=event-a', { headers: h.req('c').headers }));
  assert.equal(response.status, 403);
});

test('legacy staff order reads reject invalid assignments before reading orders', async () => {
  const h = fixture();
  h.settings.get('workstations:event-a').kitchen[0].active = false;
  const response = await h.api('src/app/api/orders/route.ts').GET(new Request('https://afro.test/api/orders?status=NEW', { headers: h.req('d').headers }));
  assert.equal(response.status, 403);
  assert.equal(h.queries.some(q => q.includes('FROM orders')), false);
});

test('card attribution survives asynchronous confirmation and duplicate confirmation by another cashier', async () => {
  const h = fixture();
  await h.lease('a'); await h.lease('b');
  h.orders.set('card', { id: 'card', event_id: 'event-a', payment: 'card', status: 'PENDING_PAYMENT', created_by: 'louka', created_by_username: 'louka', register_id: station2, stripe_payment_intent_id: 'pi_reserved', amount_cents: 1000, currency: 'eur' });
  const guard = h.api('src/lib/cashier-write-context.ts');
  await guard.reserveCardCashier('card', await guard.requireCashierWrite(h.req('a'), 'event-a'));
  const finalize = h.api('src/lib/finalize-sale.ts');
  const payment = { payment: 'card', paymentIntentId: 'pi_reserved', amountReceived: 1000, currency: 'eur' };
  assert.equal((await finalize.finalizeSale('card', payment)).changed, true);
  assert.equal((await finalize.finalizeSale('card', payment)).changed, false);
  const row = h.orders.get('card');
  assert.equal(row.created_by, 'louka'); assert.equal(row.register_id, station2);
  assert.equal(row.paid_by, 'cem'); assert.equal(row.paid_by_username, 'cem'); assert.equal(row.paid_register_id, station1);
  await assert.rejects(guard.reserveCardCashier('card', await guard.requireCashierWrite(h.req('b'), 'event-a')));
  assert.equal(row.paid_by, 'cem');
});

test('card cancellation requires the assigned register lease before any cancellation work', async () => {
  const h = fixture();
  const response = await h.api('src/app/api/orders/[id]/cancel-card-payment/route.ts').POST(h.req('a', { eventId: 'event-a' }), { params: Promise.resolve({ id: 'card' }) });
  assert.equal(response.status, 423);
  assert.equal(h.queries.some(q => q.includes('FROM orders') || q.includes('UPDATE orders')), false);
});

for (const [token, username, workstationId, identifier] of [['a', 'cem', station1, 'normal'], ['b', 'louka', station2, 'normal'], ['a', 'cem', station1, 'empty'], ['b', 'louka', station2, 'omitted']]) {
  test(`admin form edits existing unassigned ${username} on testmaison through PATCH: ${identifier} id`, async () => {
    const h = fixture();
    assert.equal((await h.lease(token)).status, 200);
    const config = h.settings.get('workstations:event-a');
    h.settings.get('store_config').events.push({ id: 'testmaison', name: 'testmaison' });
    h.settings.set('workstations:testmaison', config);
    const user = h.users.get(token);
    if (identifier === 'empty') user.id = '';
    Object.assign(user, { cashier_event_id: 'testmaison', workstation_id: null });
    const api = h.api('src/app/api/staff/users/route.ts');
    const calls = [];
    const staffFetch = async (url, options = {}) => {
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : {};
      calls.push({ url, method, body });
      const request = h.req('c', body, { method });
      if (url === '/api/staff/users') {
        const response = await api[method](request);
        if (method === 'GET' && identifier === 'omitted') {
          const data = await response.json();
          for (const row of data.users) if (row.username === username) delete row.id;
          return Response.json(data);
        }
        return response;
      }
      if (url === '/api/staff/workstations') return h.api('src/app/api/staff/workstations/route.ts').GET(request);
      throw Error('Unexpected endpoint: ' + url);
    };
    const page = harness('src/app/staff/admin/users/page.tsx', {}, { '@/lib/staff-auth': { staffFetch } });
    let tree = page.render();
    page.effects[0]();
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
    tree = page.render();
    const account = findAll(tree, node => node.type === 'li' && node.props.children[0] === username)[0];
    findAll(account, node => node.type === 'button')[0].props.onClick();
    tree = page.render();
    let form = findAll(tree, node => node.type === 'form')[0];
    assert.equal(findAll(form, node => node.type === 'h2')[0].props.children, `Modifier ${username}`);
    assert.equal(findAll(form, node => node.type === 'input' && node.props.type === 'password').length, 0);
    findAll(form, node => node.type === 'select')[1].props.onChange({ target: { value: 'testmaison' } });
    tree = page.render();
    form = findAll(tree, node => node.type === 'form')[0];
    findAll(form, node => node.type === 'select')[2].props.onChange({ target: { value: workstationId } });
    tree = page.render();
    form = findAll(tree, node => node.type === 'form')[0];
    await form.props.onSubmit({ preventDefault() {} });
    const writes = calls.filter(call => call.method !== 'GET');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, 'PATCH');
    assert.equal(writes[0].body.id, identifier === 'omitted' ? undefined : user.id);
    assert.equal(page.state.error, '');
    assert.equal(user.workstation_id, workstationId);
    assert.equal(h.sessions.get(hash(token.repeat(64))).revoked, true);
    assert.equal(h.locks.size, 0);
    assert.equal(h.queries.some(q => q.includes('INSERT INTO staff_users')), false);
  });
}

test('real create request for an existing username remains rejected', async () => {
  const h = fixture();
  const before = structuredClone(h.users.get('a'));
  const response = await h.api('src/app/api/staff/users/route.ts').POST(h.req('c', {
    id: before.id, username: 'cem', password: 'fixture-only-long-password', role: 'cashier', active: true,
    eventId: 'event-a', workstationId: station2,
  }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'account_exists_or_assignment_changed');
  assert.deepEqual(h.users.get('a'), before);
  assert.equal(h.users.size, 6);
  assert.equal(h.sessions.get(hash('a'.repeat(64))).revoked, false);
});

test('editing a missing username without an id never creates an account or revokes sessions', async () => {
  const h = fixture();
  const response = await h.api('src/app/api/staff/users/route.ts').PATCH(h.req('c', {
    username: 'missing-user', role: 'cashier', active: true, eventId: 'event-a', workstationId: station1,
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'invalid_staff_id');
  assert.equal(h.users.size, 6);
  assert.equal(h.queries.some(q => q.includes('INSERT INTO staff_users') || q.includes('UPDATE staff_users') || q.includes('UPDATE staff_sessions')), false);
});
