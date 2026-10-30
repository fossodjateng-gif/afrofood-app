/* eslint-disable @typescript-eslint/no-require-imports */
// Embedded PostgreSQL only; run with tests/deny-network.cjs preloaded.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, harness, findAll } = require('./ui-harness.cjs');

test('stats API: actual SQL, refund accounting and historical compatibility', async t => {
  assert.ok(process.env.AFROFOOD_PGLITE_MODULE, 'Set AFROFOOD_PGLITE_MODULE to an isolated PGlite installation');
  const { PGlite } = require(process.env.AFROFOOD_PGLITE_MODULE);
  const db = new PGlite();
  t.after(() => db.close());
  // Only the columns read by stats. Unknown refund states/methods are deliberately
  // permitted in this fixture to check exclusion and totals defensively.
  await db.exec(`CREATE TABLE orders (
    id TEXT PRIMARY KEY, created_at TIMESTAMP NOT NULL, status TEXT,
    amount_cents INTEGER, payment TEXT, payment_provider TEXT, event_name TEXT, event_id TEXT, paid_at TIMESTAMP,
    items JSONB NOT NULL DEFAULT '[{"name":"Meal","qty":2}]');
    CREATE TABLE order_refunds (order_id TEXT PRIMARY KEY REFERENCES orders(id),
      payment_method TEXT, refund_state TEXT, refund_amount_cents INTEGER, refunded_at TIMESTAMPTZ);`);
  await db.exec(`CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value JSONB); INSERT INTO app_settings VALUES ('store_config', '{"events":[{"id":"Festival","name":"Festival"},{"id":"Other","name":"Other"},{"id":"empty","name":"Empty"}]}');`);
  const queries = [];
  const sql = async (strings, ...values) => {
    const query = strings.reduce((q, part, i) => q + part + (i < values.length ? `$${i + 1}` : ''), '');
    assert.match(query.trim(), /^(SELECT|WITH)\b/);
    queries.push(query);
    return (await db.query(query, values)).rows;
  };
  class StaffAuthError extends Error {}
  let adminChecks = 0;
  const api = load('src/app/api/stats/route.ts', {
    '@/lib/db': { sql },
    '@/lib/orders-schema': { ensureOrdersSchema: async () => {} },
    '@/lib/staff-admin-server': { requireStaffAdmin: async () => { adminChecks++; } },
    '@/lib/staff-session-server': { StaffAuthError },
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  });
  const reset = () => db.exec('TRUNCATE order_refunds, orders');
  async function sale(id, payment, amount = 1200, options = {}) {
    await db.query(`INSERT INTO orders (id,created_at,status,amount_cents,payment,payment_provider,event_name,event_id)
      VALUES ($1,COALESCE($2::timestamp, NOW()),$3,$4,$5,$6,$7,$7)`,
    [id, options.date || null, options.status || 'READY', amount, payment, options.provider || null, options.event || 'Festival']);
  }
  const refund = (id, method, amount, state = 'refunded') => db.query(
    `INSERT INTO order_refunds VALUES ($1,$2,$3,$4,NOW() + interval '40 days')`, [id, method, state, amount]);
  async function get(params = '') {
    const query = new URLSearchParams(params.replace(/^\?/, ''));
    if (!query.has('eventId')) query.set('eventId', 'Festival');
    const response = await api.GET(new Request(`http://fixture/api/stats?${query}`));
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.ok, true);
    return data;
  }
  const amounts = (cashCents, cardCents, totalCents = cashCents + cardCents) => ({ cashCents, cardCents, totalCents });

  for (const method of ['cash', 'card']) {
    for (const confirmed of [false, true]) await t.test(`${method}: ${confirmed ? 'full refund' : 'no refund'}`, async () => {
      await reset(); await sale('sale', method);
      if (confirmed) await refund('sale', method, 1200);
      const data = await get();
      const gross = method === 'cash' ? amounts(1200, 0) : amounts(0, 1200);
      assert.deepEqual(data.financials, { gross, refunded: confirmed ? gross : amounts(0, 0), net: confirmed ? amounts(0, 0) : gross });
      assert.deepEqual(data.summary, { revenueCents: 1200, transactions: 1, canceledTransactions: 0, avgBasketCents: 1200 });
      assert.deepEqual((await get()).financials, data.financials, 'Repeated reads never double count');
    });
  }
  await t.test('only refunded is deducted, including when refunded_at exists for another state', async () => {
    await reset();
    for (const state of ['requested', 'processing', 'failed', 'requires_review', 'canceled']) {
      await sale(state, 'card'); await refund(state, 'card', 1200, state);
    }
    const { financials } = await get();
    assert.deepEqual(financials.gross, amounts(0, 6000));
    assert.deepEqual(financials.refunded, amounts(0, 0));
    assert.deepEqual(financials.net, financials.gross);
  });
  await t.test('card and stripe consolidate without changing legacy payment groups', async () => {
    await reset(); await sale('card', 'card', 100); await sale('stripe', 'card', 200, { provider: 'stripe' });
    await sale('legacy-stripe', 'stripe', 300);
    const data = await get();
    assert.deepEqual(data.financials.gross, amounts(0, 600));
    assert.deepEqual(data.paymentMethods.map(row => row.method).sort(), ['card', 'stripe']);
  });
  await t.test('cashless/other contribute to real totals without reclassification', async () => {
    await reset();
    for (const [id, method, amount] of [['cash', 'cash', 100], ['card', 'card', 200], ['cashless', 'cashless', 300], ['other', '', 400]]) {
      await sale(id, method, amount); await refund(id, method || 'other', amount);
    }
    const { financials } = await get();
    assert.deepEqual(financials.gross, amounts(100, 200, 1000));
    assert.deepEqual(financials.refunded, amounts(100, 200, 1000));
    assert.deepEqual(financials.net, amounts(0, 0));
  });
  await t.test('period and event follow original sale, not refund date; legacy fields stay intact', async () => {
    await reset();
    const old = (await db.query("SELECT (date_trunc('month', NOW()) - interval '50 days')::text AS date")).rows[0].date;
    await sale('current', 'cash', 1200); await refund('current', 'cash', 1200);
    await sale('old', 'card', 800, { date: old }); await refund('old', 'card', 800);
    await sale('other-event', 'card', 900, { event: 'Other' });
    await sale('canceled', 'cash', 500, { status: 'CANCELED' });
    await sale('pending', 'card', 500, { status: 'PENDING_PAYMENT' });
    await sale('null', 'cash', null);
    for (const period of ['today', 'week', 'month']) {
      const data = await get(`?period=${period}&eventId=Festival`);
      assert.deepEqual(data.financials, { gross: amounts(1200, 0), refunded: amounts(1200, 0), net: amounts(0, 0) });
      assert.deepEqual(data.filters, { period, eventId: 'Festival' });
      assert.deepEqual(data.summary, { revenueCents: 1200, transactions: 1, canceledTransactions: 1, avgBasketCents: 1200 });
      for (const key of ['today', 'week', 'month']) assert.deepEqual(data.kpis[key], { revenueCents: 1200, transactions: 1, avgBasketCents: 1200 });
      assert.deepEqual(data.topProducts, [{ name: 'Meal', qty: 2 }]);
      assert.equal(data.salesByHour.reduce((n, row) => n + row.revenueCents, 0), 1200);
      assert.deepEqual(data.paymentMethods, [{ method: 'cash', transactions: 1, revenueCents: 1200, sharePct: 100 }]);
      assert.deepEqual(data.salesByEvent, [{ eventName: 'Festival', transactions: 1, revenueCents: 1200 }]);
      assert.deepEqual(data.availableEvents.map(event => event.id), ['Festival', 'Other', 'empty']);
      assert.ok(!Number.isNaN(Date.parse(data.generatedAt)));
    }
    const all = await get('?period=all&eventId=Festival');
    assert.deepEqual(all.financials.refunded, amounts(1200, 800));
    assert.equal(all.summary.transactions, 2);
    const defaults = await get('?period=invalid&eventId=Festival');
    assert.deepEqual(defaults.filters, { period: 'all', eventId: 'Festival' });
    assert.equal(defaults.financials.gross.totalCents, 2000);
    assert.ok(adminChecks > 0);
    assert.ok(queries.some(query => query.includes('COALESCE(paid_at, created_at)')));
  });
  await t.test('empty selection returns nine zero amounts', async () => {
    const { financials } = await get('?eventId=empty');
    assert.deepEqual(financials, { gross: amounts(0, 0), refunded: amounts(0, 0), net: amounts(0, 0) });
  });
  await t.test('event IDs isolate identical names and aggregate both registers', async () => {
    await reset();
    await sale('papa', 'cash', 60000); await sale('maman', 'card', 40000); await refund('maman', 'card', 10000);
    await sale('foreign', 'cash', 99900, { event: 'Other' });
    await db.exec("UPDATE orders SET event_name = 'Festival' WHERE id = 'foreign'");
    const data = await get('?eventId=Festival');
    assert.equal(data.financials.gross.cashCents, 60000); assert.equal(data.financials.gross.cardCents, 40000);
    assert.equal(data.financials.gross.totalCents, 100000); assert.equal(data.financials.refunded.totalCents, 10000);
    assert.equal(data.financials.net.totalCents, 90000); assert.equal(data.summary.transactions, 2);
    assert.equal((await get('?eventId=Other')).summary.revenueCents, 99900);
  });
  await t.test('today follows Berlin paid date with a creation-date fallback for legacy sales', async () => {
    await reset();
    await sale('paid-today', 'cash', 1000, { date: '2020-01-01T00:00:00' });
    await sale('paid-yesterday', 'card', 9000);
    await db.exec(`UPDATE orders SET paid_at = ((date_trunc('day', NOW() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'UTC') WHERE id = 'paid-today';
      UPDATE orders SET paid_at = ((date_trunc('day', NOW() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'UTC') - interval '1 millisecond' WHERE id = 'paid-yesterday'`);
    const data = await get('?period=today'); assert.equal(data.summary.revenueCents, 1000); assert.equal(data.summary.transactions, 1);
  });
});

const text = tree => tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join(' ') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);

test('stats event selection uses IDs, preserves the initial Admin event and cancels stale responses', async t => {
  const previousWindow = global.window, previousStorage = global.localStorage;
  global.window = { location: { search: '?eventId=b' } }; global.localStorage = { getItem: () => 'a', setItem() {} };
  t.after(() => { global.window = previousWindow; global.localStorage = previousStorage; });
  const calls = []; let finish;
  const h = harness('src/app/stats/page.tsx', { isUnlocked: true }, {
    '@/lib/staff-auth': { getSession: () => ({ userId: 'admin', role: 'admin' }), getStaffRoleLabel: role => role,
      staffFetch: async (url, init) => {
        calls.push([url, init]);
        if (url.includes('catalog=1')) return Response.json({ ok: true, events: [{ id: 'a', name: 'Festival' }, { id: 'b', name: 'Festival' }] });
        return new Promise(resolve => { finish = resolve; });
      } },
  });
  h.render(); const cleanupCatalog = h.effects.find(fn => fn.toString().includes('/api/stats?catalog=1'))();
  await new Promise(resolve => setImmediate(resolve)); let tree = h.render();
  assert.equal(h.state.eventFilter, 'b');
  const selects = findAll(tree, n => n.type === 'select');
  assert.deepEqual(findAll(selects[1], n => n.type === 'option').map(n => n.props.value), ['a', 'b']);
  h.effects.find(fn => fn.toString().includes('void fetchStats'))();
  assert.equal(calls.at(-1)[0], '/api/stats?period=all&eventId=b');
  const signal = calls.at(-1)[1].signal;
  selects[1].props.onChange({ target: { value: 'a' } }); assert.equal(signal.aborted, true); assert.equal(h.state.stats, null);
  finish(Response.json({ ok: true, filters: { eventId: 'b', period: 'all' }, summary: { revenueCents: 99999 } }));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(h.state.stats, null);
  tree = h.render(); assert.equal(findAll(tree, n => n.type === 'select')[1].props.value, 'a');
  assert.ok(calls.every(([url, init]) => url.startsWith('/api/stats?') && !init.method));
  cleanupCatalog();
});

test('stats never mounts a temporary cashier workspace, even with an existing temporary context', () => {
  const path = '/stats', session = { userId: 'admin', role: 'admin', workstationId: null, cashierEventId: null };
  const h = harness('src/components/StaffSessionBoundary.tsx', { snapshot: { path, session } }, {
    'next/navigation': { usePathname: () => path },
    '@/lib/temporary-cashier-client': { hasTemporaryCashierContext: () => true },
  });
  assert.equal(h.render(h.component.StaffSessionBoundary, { children: 'stats' }).props.children, 'stats');
});

for (const [lang, headers, labels] of [
  ['fr', ['Espèces', 'Carte', 'Total'], ['CA brut', 'Remboursements confirmés', 'CA net']],
  ['de', ['Bar', 'Karte', 'Gesamt'], ['Umsatz vor Erstattungen', 'Bestätigte Erstattungen', 'Umsatz nach Erstattungen']],
  ['en', ['Cash', 'Card', 'Total'], ['Gross revenue', 'Confirmed refunds', 'Net revenue']],
]) test(`stats UI ${lang}: nine amounts, translated labels and existing filters`, async t => {
  const kpi = { revenueCents: 9000, transactions: 3, avgBasketCents: 3000 };
  const stats = {
    filters: { period: 'week', eventId: 'Festival' }, generatedAt: '2026-10-27T10:00:00Z', summary: { ...kpi, canceledTransactions: 0 },
    kpis: { today: kpi, week: kpi, month: kpi },
    financials: { gross: { cashCents: 1234, cardCents: 5678, totalCents: 9000 },
      refunded: { cashCents: 234, cardCents: 678, totalCents: 1000 },
      net: { cashCents: 1000, cardCents: 5000, totalCents: 8000 } },
    topProducts: [], salesByHour: [], paymentMethods: [], salesByEvent: [], availableEvents: ['Festival'],
  };
  const h = harness('src/app/stats/page.tsx', { lang, stats, isUnlocked: true, loading: false, period: 'week', eventFilter: 'Festival', storeEvents: [{ id: 'Festival', name: 'Festival' }] }, {
    'next/image': { default: () => null },
    '@/lib/staff-auth': { getSession: () => null, getStaffRoleLabel: () => '', staffFetch: (...args) => fetch(...args) },
  });
  const tree = h.render();
  const table = findAll(tree, node => node.type === 'table' && findAll(node, child => child.type === 'caption').length)[0];
  assert.ok(table);
  assert.deepEqual(findAll(table, node => node.type === 'th' && node.props.scope === 'col').slice(1).map(text), headers);
  assert.deepEqual(findAll(table, node => node.type === 'th' && node.props.scope === 'row').map(text), labels);
  const locale = { fr: 'fr-FR', de: 'de-DE', en: 'en-US' }[lang];
  const format = cents => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(cents / 100);
  assert.deepEqual(findAll(table, node => node.type === 'td').map(text), Object.values(stats.financials).flatMap(row => Object.values(row).map(format)));
  const selects = findAll(tree, node => node.type === 'select');
  assert.deepEqual(selects.map(node => node.props.value), ['week', 'Festival']);
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  let requested;
  global.fetch = async url => { requested = url; return { ok: true, json: async () => ({ ...stats, ok: true }) }; };
  await findAll(tree, node => node.type === 'button' && String(node.props.onClick).includes('fetchStats'))[0].props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requested, '/api/stats?period=week&eventId=Festival');
});
