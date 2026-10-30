/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { load, harness, findAll } = require('./ui-harness.cjs');
const papa = '11111111-1111-4111-8111-111111111111', maman = '22222222-2222-4222-8222-222222222222';
const settle = () => new Promise(resolve => setImmediate(resolve));
const component = (tree, name) => findAll(tree, n => n.type?.name === name)[0];

function server() {
  class StaffAuthError extends Error { constructor(code, status = 401) { super(code); this.code = code; this.status = status; } }
  let role = 'admin', valid = true;
  const queries = [], transactions = [];
  const rows = Array.from({ length: 55 }, (_, i) => ({ id: `sale-${i}`, event_id: 'a', paid_register_id: i % 2 ? maman : papa, can_refund: true }));
  rows.push({ id: 'b-sale', event_id: 'b', paid_register_id: maman, can_refund: true });
  const sql = (strings, ...values) => {
    const q = strings.join('?');
    if (q.includes('FROM app_settings')) return Promise.resolve([{ setting_value: { events: [{ id: 'a', name: 'Festival A' }, { id: 'b', name: 'Festival B' }] } }]);
    queries.push({ q, values });
    assert.match(q.trim(), /^SELECT/);
    assert.doesNotMatch(q, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/);
    assert.match(q, /WHERE event_id = \?/);
    assert.match(q, /paid_register_id = \?/);
    const matching = rows.filter(row => row.event_id === values[0] && (!values[1] || row.paid_register_id === values[2]));
    return Promise.resolve(q.includes('COUNT(*)')
      ? [{ day: '2026-10-30', currency: 'eur', count: String(matching.length), total_cents: String(matching.length * 1000) }]
      : matching.slice(values[5], values[5] + values[4]));
  };
  sql.transaction = async (requests, options) => { transactions.push(options); return Promise.all(requests); };
  const api = load('src/app/api/admin/sales-history/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/db': { sql },
    '@/lib/staff-session-server': { StaffAuthError, requireStaffSession: async () => {
      if (!valid) throw new StaffAuthError('session_required');
      return { id: 'admin', role, workstationId: null, cashierEventId: null };
    } },
    '@/lib/menu-settings': { getStoreConfig: async () => ({ events: [{ id: 'a' }, { id: 'b' }] }) },
    '@/lib/workstations-server': { getWorkstations: async eventId => ({ cashier: [{ id: eventId === 'a' ? papa : maman, type: 'cashier', active: false }], kitchen: [] }) },
    '@/lib/cashier-locks': new Proxy({}, { get() { throw Error('No V3 in global history'); } }),
    '@/lib/cashier-operational-context': new Proxy({}, { get() { throw Error('No temporary context in global history'); } }),
  });
  const request = query => new Request(`https://fixture.test/api/admin/sales-history?${query}`);
  return { api, queries, transactions, request, role: value => { role = value; }, revoke: () => { valid = false; } };
}

test('global history uses Admin identity without a register, filters events/registers and totals beyond the page', async () => {
  const f = server();
  const all = await f.api.GET(f.request('eventId=a'));
  assert.equal(all.status, 200); assert.equal(all.headers.get('cache-control'), 'no-store');
  const data = await all.json();
  assert.equal(data.orders.length, 50); assert.equal(data.hasMore, true);
  assert.equal(data.dailyTotals[0].count, 55); assert.equal(data.dailyTotals[0].totalCents, 55000);
  assert.equal(data.workstationId, null); assert.equal(data.readOnly, true);
  assert.ok(data.orders.every(row => row.event_id === 'a' && row.can_refund === false));
  const filtered = await (await f.api.GET(f.request(`eventId=a&workstationId=${papa}`))).json();
  assert.equal(filtered.orders.length, 28); assert.equal(filtered.dailyTotals[0].count, 28);
  assert.ok(filtered.orders.every(row => row.paid_register_id === papa));
  const b = await (await f.api.GET(f.request('eventId=b'))).json();
  assert.deepEqual(b.orders.map(row => row.id), ['b-sale']);
  assert.deepEqual(f.transactions, Array(3).fill({ readOnly: true, isolationLevel: 'RepeatableRead' }));
});

for (const scenario of ['cashier', 'kitchen', 'session', 'missing-event', 'unknown-event', 'bad-register', 'foreign-register', 'empty-register', 'pagination']) {
  test(`global history rejects ${scenario} before querying sales`, async () => {
    const f = server(); let query = 'eventId=a';
    if (['cashier', 'kitchen'].includes(scenario)) f.role(scenario);
    if (scenario === 'session') f.revoke();
    if (scenario === 'missing-event') query = '';
    if (scenario === 'unknown-event') query = 'eventId=unknown';
    if (scenario === 'bad-register') query += '&workstationId=invalid';
    if (scenario === 'foreign-register') query += `&workstationId=${maman}`;
    if (scenario === 'empty-register') query += '&workstationId=';
    if (scenario === 'pagination') query += '&limit=0';
    assert.ok([400, 401, 403].includes((await f.api.GET(f.request(query))).status));
    assert.equal(f.queries.length, 0); assert.equal(f.transactions.length, 0);
  });
}

test('Admin page initial event and event change use only that event registers and reset to all registers', async t => {
  const oldWindow = global.window;
  global.window = { location: { search: '?eventId=b' } }; t.after(() => { global.window = oldWindow; });
  const calls = [];
  const h = harness('src/app/staff/admin/history/page.tsx', {}, {
    '@/lib/translations': { getSavedLang: () => 'fr', saveLang() {} },
    '@/lib/staff-auth': { getSession: () => ({ role: 'admin', username: 'admin' }), getStaffRoleLabel: role => role,
      staffFetch: async (url, init) => { calls.push([url, init]); return Response.json({ ok: true, events: [{ id: 'a', name: 'Festival A' }, { id: 'b', name: 'Festival B' }],
        workstations: { a: { cashier: [{ id: papa, type: 'cashier', name: 'Papa' }] }, b: { cashier: [{ id: maman, type: 'cashier', name: 'Maman' }] } } }); } },
  });
  h.render(); const cleanup = h.effects[0](); await settle(); let tree = h.render();
  const selects = () => findAll(tree, n => n.type === 'select');
  assert.equal(selects()[0].props.value, 'b'); assert.equal(selects()[1].props.value, '');
  assert.deepEqual(findAll(selects()[1], n => n.type === 'option').map(n => n.props.value), ['', maman]);
  selects()[1].props.onChange({ target: { value: maman } }); tree = h.render();
  assert.equal(component(tree, 'OrderHistory').props.workstationId, maman);
  selects()[0].props.onChange({ target: { value: 'a' } }); tree = h.render();
  assert.deepEqual(h.state.selection, { eventId: 'a', workstationId: '' });
  assert.deepEqual(findAll(selects()[1], n => n.type === 'option').map(n => n.props.value), ['', papa]);
  const history = component(tree, 'OrderHistory');
  assert.equal(history.props.scope, 'admin'); assert.equal(history.props.readOnly, true);
  assert.equal(history.props.workstationId, undefined);
  assert.deepEqual(calls.map(([url]) => url), ['/api/admin/sales-history/catalog']);
  cleanup();
});

test('global history shows paid register or historical creation attribution and no Refund action', async t => {
  const oldWindow = global.window; global.window = { setInterval: () => 1, clearInterval() {} };
  t.after(() => { global.window = oldWindow; });
  const base = { event_id: 'a', status: 'DONE', payment: 'cash', amount_cents: 1000, created_at: '2026-10-30T10:00:00Z', items: [], can_refund: true };
  const orders = [{ ...base, id: 'paid', paid_register_id: papa, paid_register_name: 'Caisse papa' }, { ...base, id: 'legacy', register_id: maman, register_name: 'Caisse maman' }];
  const h = harness('src/components/pos/OrderHistory.tsx');
  const props = { scope: 'admin', readOnly: true, eventId: 'a', lang: 'fr', selectedOrderId: null, onSelect() {}, request: async () => Response.json({ eventId: 'a', workstationId: null, readOnly: true, orders, dailyTotals: [{ day: '2026-10-30', count: 55, totalCents: 55000, currency: 'eur' }] }) };
  h.render(h.component.OrderHistory, props); const cleanup = h.effects[0](); await settle();
  const tree = h.render(h.component.OrderHistory, props);
  assert.equal(findAll(tree, n => n.type?.name === 'RefundAction').length, 0);
  const rendered = JSON.stringify(tree);
  assert.match(rendered, /Caisse papa/); assert.match(rendered, /Caisse maman/); assert.match(rendered, /55 ventes/);
  cleanup();
});

test('reporting catalog authenticates Admin and executes SELECT only, without preparing the schema', async () => {
  class StaffAuthError extends Error { constructor(code, status = 401) { super(code); this.code = code; this.status = status; } }
  const queries = []; let role = 'cashier';
  const api = load('src/app/api/admin/sales-history/catalog/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/staff-session-server': { StaffAuthError, requireStaffSession: async () => ({ role }) },
    '@/lib/db': { sql: async (strings, ...values) => {
      const q = strings.join('?'); queries.push(q);
      assert.match(q.trim(), /^SELECT/); assert.doesNotMatch(q, /\b(CREATE|ALTER|INSERT|UPDATE|DELETE)\b/);
      return values.length ? [{ setting_value: { cashier: [{ id: papa, type: 'cashier', name: 'Papa', active: true }], kitchen: [] } }]
        : [{ setting_value: { events: [{ id: 'a', name: 'Festival A' }] } }];
    } },
  });
  const req = new Request('https://fixture.test/api/admin/sales-history/catalog');
  assert.equal((await api.GET(req)).status, 403); assert.equal(queries.length, 0);
  role = 'admin'; const response = await api.GET(req); assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.events[0].id, 'a');
  assert.equal(data.workstations.a.cashier[0].id, papa); assert.equal(queries.length, 2);
});

test('global history bypasses the operational workspace even when a temporary context already exists', () => {
  const path = '/staff/admin/history', session = { userId: 'admin', role: 'admin', cashierEventId: null, workstationId: null };
  const h = harness('src/components/StaffSessionBoundary.tsx', { snapshot: { path, session } }, {
    'next/navigation': { usePathname: () => path },
    '@/lib/temporary-cashier-client': { hasTemporaryCashierContext: () => true },
  });
  const tree = h.render(h.component.StaffSessionBoundary, { children: 'global-history' });
  assert.equal(tree.props.children, 'global-history');
});
