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
    amount_cents INTEGER, payment TEXT, payment_provider TEXT, event_name TEXT,
    items JSONB NOT NULL DEFAULT '[{"name":"Meal","qty":2}]');
    CREATE TABLE order_refunds (order_id TEXT PRIMARY KEY REFERENCES orders(id),
      payment_method TEXT, refund_state TEXT, refund_amount_cents INTEGER, refunded_at TIMESTAMPTZ);`);
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
    await db.query(`INSERT INTO orders (id,created_at,status,amount_cents,payment,payment_provider,event_name)
      VALUES ($1,COALESCE($2::timestamp, NOW()),$3,$4,$5,$6,$7)`,
    [id, options.date || null, options.status || 'READY', amount, payment, options.provider || null, options.event || 'Festival']);
  }
  const refund = (id, method, amount, state = 'refunded') => db.query(
    `INSERT INTO order_refunds VALUES ($1,$2,$3,$4,NOW() + interval '40 days')`, [id, method, state, amount]);
  async function get(params = '') {
    const response = await api.GET(new Request(`http://fixture/api/stats${params}`));
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
    for (const state of ['requested', 'processing', 'failed', 'requires_review']) {
      await sale(state, 'card'); await refund(state, 'card', 1200, state);
    }
    const { financials } = await get();
    assert.deepEqual(financials.gross, amounts(0, 4800));
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
      const data = await get(`?period=${period}&event=%20fEsTiVaL%20`);
      assert.deepEqual(data.financials, { gross: amounts(1200, 0), refunded: amounts(1200, 0), net: amounts(0, 0) });
      assert.deepEqual(data.filters, { period, event: 'fEsTiVaL' });
      assert.deepEqual(data.summary, { revenueCents: 1200, transactions: 1, canceledTransactions: 1, avgBasketCents: 1200 });
      for (const key of ['today', 'week', 'month']) assert.deepEqual(data.kpis[key], { revenueCents: 1200, transactions: 1, avgBasketCents: 1200 });
      assert.deepEqual(data.topProducts, [{ name: 'Meal', qty: 2 }]);
      assert.equal(data.salesByHour.reduce((n, row) => n + row.revenueCents, 0), 1200);
      assert.deepEqual(data.paymentMethods, [{ method: 'cash', transactions: 1, revenueCents: 1200, sharePct: 100 }]);
      assert.deepEqual(data.salesByEvent, [{ eventName: 'Festival', transactions: 1, revenueCents: 1200 }]);
      assert.deepEqual(data.availableEvents, ['Festival', 'Other']);
      assert.ok(!Number.isNaN(Date.parse(data.generatedAt)));
    }
    const all = await get('?period=all&event=Festival');
    assert.deepEqual(all.financials.refunded, amounts(1200, 800));
    assert.equal(all.summary.transactions, 2);
    const defaults = await get('?period=invalid&event=ALL');
    assert.deepEqual(defaults.filters, { period: 'all', event: 'all' });
    assert.equal(defaults.financials.gross.totalCents, 2900);
    assert.ok(adminChecks > 0);
    assert.ok(queries.every(query => !query.includes('paid_at')));
  });
  await t.test('empty selection returns nine zero amounts', async () => {
    const { financials } = await get('?event=missing');
    assert.deepEqual(financials, { gross: amounts(0, 0), refunded: amounts(0, 0), net: amounts(0, 0) });
  });
});

const text = tree => tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join(' ') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
for (const [lang, headers, labels] of [
  ['fr', ['Espèces', 'Carte', 'Total'], ['CA brut', 'Remboursements', 'CA net']],
  ['de', ['Bar', 'Karte', 'Gesamt'], ['Umsatz vor Erstattungen', 'Erstattungen', 'Umsatz nach Erstattungen']],
  ['en', ['Cash', 'Card', 'Total'], ['Gross revenue', 'Refunds', 'Net revenue']],
]) test(`stats UI ${lang}: nine amounts, translated labels and existing filters`, async t => {
  const kpi = { revenueCents: 9000, transactions: 3, avgBasketCents: 3000 };
  const stats = {
    generatedAt: '2026-10-27T10:00:00Z', summary: { ...kpi, canceledTransactions: 0 },
    kpis: { today: kpi, week: kpi, month: kpi },
    financials: { gross: { cashCents: 1234, cardCents: 5678, totalCents: 9000 },
      refunded: { cashCents: 234, cardCents: 678, totalCents: 1000 },
      net: { cashCents: 1000, cardCents: 5000, totalCents: 8000 } },
    topProducts: [], salesByHour: [], paymentMethods: [], salesByEvent: [], availableEvents: ['Festival'],
  };
  const h = harness('src/app/stats/page.tsx', { lang, stats, isUnlocked: true, loading: false, period: 'week', eventFilter: 'Festival' }, {
    'next/image': { default: () => null },
    '@/lib/staff-auth': { getSession: () => null, getStaffRoleLabel: () => '' },
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
  assert.equal(requested, '/api/stats?period=week&event=Festival');
});
