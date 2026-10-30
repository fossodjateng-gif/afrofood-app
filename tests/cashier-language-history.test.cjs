/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { load, harness, findAll } = require('./ui-harness.cjs');
const station = '11111111-1111-4111-8111-111111111111', otherStation = '22222222-2222-4222-8222-222222222222';
const instance = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contextId = 'a'.repeat(64);
const settle = () => new Promise(resolve => setImmediate(resolve));

function historyServer() {
  class StaffAuthError extends Error { constructor(code, status = 401) { super(code); this.code = code; this.status = status; } }
  const actor = { id: 'admin', username: 'admin', role: 'admin', active: true, cashierEventId: null, workstationId: null };
  const row = { cashier_context_id: contextId, cashier_context_event_id: 'event-a', cashier_context_workstation_id: station,
    cashier_context_instance_id: instance, cashier_context_created_at: new Date(Date.now() - 1000),
    cashier_context_expires_at: new Date(Date.now() + 600000), session_expires_at: new Date(Date.now() + 700000) };
  const config = { cashier: [{ id: station, type: 'cashier', name: 'Caisse papa', active: true }], kitchen: [] };
  const sale = (id, register, event = 'event-a') => ({ id, event_id: event, paid_register_id: register, status: 'NEW', can_refund: true });
  const rows = [sale('papa-card', station), sale('maman', otherStation), sale('papa-cash', station), sale('unattributed', null), sale('foreign', station, 'event-b')];
  const queries = [], guards = []; let liveLease = true, validSession = true, permanentCalls = 0;
  const sql = async (strings, ...values) => {
    const q = strings.join('?');
    assert.match(q.trim(), /^SELECT/); assert.doesNotMatch(q, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/);
    queries.push({ q, values });
    if (q.includes('FROM staff_sessions')) return [row];
    if (q.includes('FROM app_settings')) return [{ setting_value: { events: [{ id: 'event-a' }] } }];
    if (q.includes('FROM orders')) {
      assert.match(q, /paid_register_id = \?/);
      return rows.filter(order => order.event_id === values[0] && (!values[1] || order.paid_register_id === values[2])).slice(values[4], values[4] + values[3]);
    }
    throw Error('Unexpected query');
  };
  const api = load('src/app/api/orders/history/route.ts', {
    '@/lib/db': { sql }, 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/staff-session-server': { StaffAuthError, staffSessionHash: () => 'server-only',
      requireStaffSession: async () => { if (!validSession) throw new StaffAuthError('session_required'); return actor; },
      requireAssignedCashRegister: async () => { permanentCalls++; throw new StaffAuthError('workstation_assignment_required', 403); } },
    '@/lib/workstations-server': { getWorkstations: async () => config },
    '@/lib/cashier-locks': { cashierLeaseGuard: async value => { guards.push(value); if (!liveLease) throw Error('lost'); } },
  });
  const request = (query = '', headers = {}) => new Request(`https://fixture.test/api/orders/history?eventId=event-a${query}`, {
    headers: { 'x-cashier-context-id': contextId, 'x-cashier-instance-id': instance, 'x-workstation-id': station, ...headers },
  });
  return { api, actor, row, config, queries, guards, request, rows,
    loseLease: () => { liveLease = false; }, revoke: () => { validSession = false; }, get permanentCalls() { return permanentCalls; } };
}

test('temporary Admin history reads only the selected register and keeps the real identity and attribution', async () => {
  const f = historyServer(), before = structuredClone(f.actor), sales = structuredClone(f.rows);
  const response = await f.api.GET(f.request(`&workstationId=${station}`));
  assert.equal(response.status, 200); const data = await response.json();
  assert.deepEqual(data.orders.map(o => o.id), ['papa-card', 'papa-cash']);
  assert.equal(data.workstationId, station); assert.equal(data.readOnly, true);
  assert.ok(data.orders.every(o => o.can_refund === false));
  assert.deepEqual(f.actor, before); assert.deepEqual(f.rows, sales);
  assert.deepEqual(f.guards[0], { userId: 'admin', username: 'admin', sessionHash: 'server-only', eventId: 'event-a', workstationId: station, contextId, instanceId: instance });
  assert.equal(f.permanentCalls, 0); assert.ok(!JSON.stringify(data).includes('server-only'));
});

test('temporary history pagination is scoped to the selected register', async () => {
  const f = historyServer();
  const first = await (await f.api.GET(f.request('&limit=1'))).json();
  const second = await (await f.api.GET(f.request('&limit=1&offset=1'))).json();
  assert.equal(first.hasMore, true); assert.equal(second.hasMore, false);
  assert.deepEqual([...first.orders, ...second.orders].map(o => o.id), ['papa-card', 'papa-cash']);
});

for (const scenario of ['role', 'session', 'expired', 'context', 'instance', 'event', 'station', 'inactive', 'lease']) {
  test(`temporary history refuses ${scenario} before reading orders, without permanent fallback`, async () => {
    const f = historyServer(); let request = f.request();
    if (scenario === 'role') f.actor.role = 'cashier';
    if (scenario === 'session') f.revoke();
    if (scenario === 'expired') f.row.cashier_context_expires_at = new Date(Date.now() - 1);
    if (scenario === 'context') request = f.request('', { 'x-cashier-context-id': '' });
    if (scenario === 'instance') request = f.request('', { 'x-cashier-instance-id': '' });
    if (scenario === 'event') request = f.request().url.replace('event-a', 'event-b');
    if (scenario === 'event') request = new Request(request, { headers: f.request().headers });
    if (scenario === 'station') request = f.request(`&workstationId=${otherStation}`);
    if (scenario === 'inactive') f.config.cashier[0].active = false;
    if (scenario === 'lease') f.loseLease();
    assert.ok([401, 403, 423].includes((await f.api.GET(request)).status));
    assert.equal(f.queries.filter(q => q.q.includes('FROM orders')).length, 0); assert.equal(f.permanentCalls, 0);
  });
}

test('an unassigned Admin still cannot get history without an explicit temporary context', async () => {
  const f = historyServer();
  assert.equal((await f.api.GET(new Request('https://fixture.test/api/orders/history?eventId=event-a'))).status, 403);
  assert.equal(f.queries.length, 0);
});

for (const temporary of [false, true]) test(`changing DE/FR/EN never restarts event validation or V3 ownership (temporary=${temporary})`, async t => {
  const oldWindow = global.window, oldFetch = global.fetch;
  const timers = [], starts = [], navigations = []; let leases = 0, disposals = 0;
  global.window = { location: { href: '', assign: path => navigations.push(path) }, setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval() {} };
  t.after(() => { global.window = oldWindow; global.fetch = oldFetch; });
  const session = { userId: temporary ? 'admin' : 'papa', username: 'papa', role: temporary ? 'admin' : 'cashier', cashierEventId: 'event-a', workstationId: station, workstationType: 'cashier',
    ...(temporary ? { temporaryContextId: contextId, temporaryInstanceId: instance } : {}) };
  const h = harness('src/app/caisse/page.tsx', { lang: 'de', staffReady: true, staffRole: session.role, staffSession: session, eventReady: true, selectedEventId: 'event-a', cashierEventId: 'event-a', isUnlocked: true, loading: false }, {
    'next/navigation': { useSearchParams: () => new URLSearchParams('view=history') },
    '@/lib/temporary-cashier-client': { hasTemporaryCashierContext: () => temporary, refreshCashierSession: async () => session },
    '@/lib/staff-auth': { getSession: () => session, getStaffRoleLabel: role => role },
    '@/lib/translations': { getSavedLang: () => 'de', saveLang() {} },
    '@/lib/cashier-lifecycle': { startCashierLifecycle: options => { starts.push(options); leases++; options.setIsUnlocked(true); return { dispose: () => { disposals++; } }; } },
  });
  const render = () => h.render(h.component.default().props.children.type);
  let tree = render();
  const lifecycleIndex = h.effects.findIndex(effect => effect.toString().includes('startCashierLifecycle'));
  const configIndex = h.effects.findIndex(effect => effect.toString().includes('/api/admin/menu-config'));
  assert.ok(lifecycleIndex >= 0 && configIndex >= 0);
  const lifecycleDeps = [...h.effectDependencies[lifecycleIndex]], configDeps = [...h.effectDependencies[configIndex]];
  h.effects[lifecycleIndex]();
  for (const language of ['fr', 'en', 'de']) {
    findAll(tree, n => n.type?.name === 'StaffPageFrame')[0].props.onLangChange(language);
    tree = render(); assert.equal(h.state.lang, language);
    assert.deepEqual(h.effectDependencies[lifecycleIndex], lifecycleDeps, 'React must keep the active lease effect');
    assert.deepEqual(h.effectDependencies[configIndex], configDeps, 'Translation must not invalidate the event');
    assert.equal(h.state.isUnlocked, true); assert.equal(h.state.staffSession, session);
    const history = findAll(tree, n => n.type?.name === 'OrderHistory')[0];
    assert.equal(history.props.readOnly, temporary); assert.equal(history.props.workstationId, station);
  }
  assert.equal(leases, 1); assert.equal(disposals, 0); assert.equal(navigations.length, 0);
  assert.equal(starts[0].session, session);
});

test('temporary history uses its authenticated transport and renders receipts/status without Refund actions', async t => {
  const oldWindow = global.window; global.window = { setInterval: () => 1, clearInterval() {}, print() {} };
  t.after(() => { global.window = oldWindow; });
  const calls = [], order = { id: 'paid', event_id: 'event-a', paid_register_id: station, payment: 'card', status: 'NEW', amount_cents: 1000, currency: 'eur', paid_at: '2026-10-29T10:00:00Z', created_at: '2026-10-29T10:00:00Z', items: [], can_refund: true, refund: { state: 'requested', amountCents: 1000, currency: 'eur' } };
  const h = harness('src/components/pos/OrderHistory.tsx');
  const request = async (url, init) => { calls.push({ url, init }); return Response.json({ eventId: 'event-a', workstationId: station, readOnly: true, orders: [order], hasMore: false }); };
  const render = props => h.render(h.component.OrderHistory, { eventId: 'event-a', workstationId: station, readOnly: true, request, lang: 'fr', selectedOrderId: null, onSelect() {}, ...props });
  render(); const cleanup = h.effects[0](); await settle();
  const tree = render();
  assert.equal(new URL(calls[0].url, 'https://fixture.test').searchParams.get('workstationId'), station);
  assert.equal(calls[0].init.method, undefined);
  assert.equal(findAll(tree, n => n.type?.name === 'RefundAction').length, 0);
  assert.equal(findAll(tree, n => n.type?.name === 'RefundStatus').length, 1);
  assert.equal(findAll(tree, n => n.type?.name === 'OnDemandOrderReceipt').length, 1);
  assert.equal(findAll(render({ workstationId: otherStation }), n => n.type === 'article').length, 0);
  cleanup();
});

test('temporary history rejects a response for another register', async t => {
  const oldWindow = global.window; global.window = { setInterval: () => 1, clearInterval() {} }; t.after(() => { global.window = oldWindow; });
  const h = harness('src/components/pos/OrderHistory.tsx');
  h.render(h.component.OrderHistory, { eventId: 'event-a', workstationId: station, readOnly: true, request: async () => Response.json({ eventId: 'event-a', workstationId: otherStation, readOnly: true, orders: [], hasMore: false }), lang: 'fr', selectedOrderId: null, onSelect() {} });
  const cleanup = h.effects[0](); await settle(); assert.equal(h.state.snapshot, null); assert.ok(h.state.error); cleanup();
});

test('permanent cashier history cannot request another register or event', async () => {
  class StaffAuthError extends Error { constructor(code, status = 403) { super(code); this.code = code; this.status = status; } }
  const queries = [];
  const api = load('src/app/api/orders/history/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/staff-session-server': { StaffAuthError, requireAssignedCashRegister: async (_req, eventId) => {
      if (eventId !== 'event-a') throw new StaffAuthError('cash_register_forbidden');
      return { role: 'cashier', workstationId: station };
    } },
    '@/lib/db': { sql: async (strings, ...values) => { queries.push(values); return [{ id: 'own', event_id: values[0], paid_register_id: values[2] }]; } },
  });
  const request = query => new Request(`https://fixture.test/api/orders/history?${query}`);
  assert.equal((await api.GET(request(`eventId=event-a&workstationId=${otherStation}`))).status, 403);
  assert.equal((await api.GET(request('eventId=event-b'))).status, 403); assert.equal(queries.length, 0);
  const data = await (await api.GET(request('eventId=event-a'))).json();
  assert.equal(data.workstationId, station); assert.equal(data.orders[0].paid_register_id, station);
  assert.equal(queries[0][1], station); assert.equal(queries[0][2], station);
});

for (const view of ['', 'view=history']) test(`cashier Back returns to its space preserving the temporary context (${view || 'orders'})`, async t => {
  const oldWindow = global.window; global.window = { location: { href: '' } }; t.after(() => { global.window = oldWindow; });
  const session = { userId: 'admin', role: 'admin', username: 'admin', cashierEventId: 'event-a', workstationId: station, temporaryContextId: contextId, temporaryInstanceId: instance };
  let suspends = 0, quits = 0;
  const h = harness('src/app/caisse/page.tsx', { lang: 'fr', staffReady: true, staffRole: 'admin', staffSession: session, eventReady: true, selectedEventId: 'event-a', cashierEventId: 'event-a', isUnlocked: true, loading: false }, {
    'next/navigation': { useSearchParams: () => new URLSearchParams(view) },
    '@/lib/temporary-cashier-client': { hasTemporaryCashierContext: () => true, quitTemporaryCashier: () => { quits++; throw Error('Back must not quit'); } },
    '@/lib/cashier-lifecycle': { startCashierLifecycle: options => { options.suspendCashierRef.current = async () => { suspends++; }; return { dispose() {} }; } },
  });
  const tree = h.render(h.component.default().props.children.type);
  h.effects.find(fn => fn.toString().includes('startCashierLifecycle'))();
  const frame = findAll(tree, n => n.type?.name === 'StaffPageFrame')[0];
  assert.equal(frame.props.back.props.children.join(''), 'Retour / Espace Caisse');
  frame.props.back.props.onClick(); await settle();
  assert.equal(window.location.href, '/staff/caisse'); assert.equal(suspends, 1); assert.equal(quits, 0);
  assert.equal(h.state.staffSession, session);
});
