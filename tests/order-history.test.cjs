/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, harness, findAll } = require('./ui-harness.cjs');

function sale(id, event_id, status, payment = 'cash') {
  return { id, event_id, status, payment, paid_at: null, amount_cents: 1000, currency: 'eur', created_at: '2026-10-08T10:00:00Z', customer_name: null, items: [{ name: 'Meal', price: 10, qty: 1 }] };
}
function route(rows) {
  const queries = [];
  const api = load('src/app/api/orders/history/route.ts', { ...require('./staff-test-mocks.cjs').legacyStaffMocks,
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/db': { sql: async (strings, ...values) => {
      const query = strings.join('?');
      queries.push({ query, values });
      assert.match(query, /^\s*SELECT\b/i);
      assert.doesNotMatch(query, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);
      assert.match(query, /WHERE event_id = \?/);
      assert.match(query, /UPPER\(status\) IN \('NEW', 'IN_PROGRESS', 'READY', 'DONE'\)/);
      // Financial eligibility is computed server-side, never inferred from status alone.
      assert.doesNotMatch(query, /pos_card_key|pos_cash_key/);
      assert.match(query, /ORDER BY created_at DESC, id DESC/);
      return rows.filter(row => row.event_id === values[0] && ['NEW', 'IN_PROGRESS', 'READY', 'DONE'].includes(row.status.toUpperCase()))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)).slice(values[2], values[2] + values[1]);
    } },
    '@/lib/orders-schema': { ensureOrdersSchema: () => { throw new Error('DDL forbidden'); } },
  });
  return { ...api, queries };
}

test('history requires eventId, validates pagination, and never queries on invalid input', async () => {
  const api = route([]);
  for (const query of ['', '?eventId=%20', '?eventId=a&limit=0', '?eventId=a&limit=101', '?eventId=a&offset=-1', '?eventId=a&limit=1.5', '?eventId=a&offset=x']) {
    assert.equal((await api.GET(new Request('https://local/api/orders/history' + query))).status, 400);
  }
  assert.equal(api.queries.length, 0);
});

test('event-scoped SELECT includes every validated status, cash/card and legacy cash without paid_at', async () => {
  const rows = ['NEW', 'IN_PROGRESS', 'READY', 'DONE'].map((status, index) => sale('a' + index, 'a', status, index % 2 ? 'card' : 'cash'));
  rows.push(sale('pending', 'a', 'PENDING_PAYMENT'), sale('canceled', 'a', 'CANCELED'), sale('foreign', 'b', 'NEW'), sale('unassigned', null, 'NEW'));
  const api = route(rows);
  const response = await api.GET(new Request('https://local/api/orders/history?eventId=a'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.eventId, 'a');
  assert.deepEqual(data.orders.map(row => row.id), ['a3', 'a2', 'a1', 'a0']);
  assert.deepEqual(new Set(data.orders.map(row => row.status)), new Set(['NEW', 'IN_PROGRESS', 'READY', 'DONE']));
  assert.ok(data.orders.some(row => row.payment === 'cash' && row.paid_at === null));
  assert.ok(data.orders.some(row => row.payment === 'card'));
  const other = await (await api.GET(new Request('https://local/api/orders/history?eventId=b'))).json();
  assert.deepEqual(other.orders.map(row => row.id), ['foreign']);
  assert.equal(api.queries.length, 2);
});

test('bounded pagination returns older sales without duplicate ids; database errors are generic', async () => {
  const api = route([sale('3', 'a', 'NEW'), sale('2', 'a', 'DONE'), sale('1', 'a', 'READY')]);
  const first = await (await api.GET(new Request('https://local/api/orders/history?eventId=a&limit=2'))).json();
  const next = await (await api.GET(new Request('https://local/api/orders/history?eventId=a&limit=2&offset=2'))).json();
  assert.equal(first.hasMore, true); assert.equal(next.hasMore, false);
  assert.deepEqual([...first.orders, ...next.orders].map(row => row.id), ['3', '2', '1']);
  const broken = load('src/app/api/orders/history/route.ts', { ...require('./staff-test-mocks.cjs').legacyStaffMocks,
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/db': { sql: async () => { throw new Error('secret connection details'); } },
  });
  const response = await broken.GET(new Request('https://local/api/orders/history?eventId=a'));
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /secret connection/);
});

test('Refund OFF hides creation in the actual UI while retaining historical refund states', async () => {
  const previous = process.env.REFUND_CREATE_ENABLED;
  try {
    const refund = { state: 'requested', amountCents: 1000, currency: 'eur', refundedAt: null };
    for (const flag of [undefined, '0', 'false', '1']) {
      if (flag === undefined) delete process.env.REFUND_CREATE_ENABLED;
      else process.env.REFUND_CREATE_ENABLED = flag;
      const api = route([
        { ...sale('eligible', 'a', 'READY', 'card'), can_refund: true, refund },
        { ...sale('ineligible', 'a', 'READY'), can_refund: false },
      ]);
      const data = await (await api.GET(new Request('https://local/api/orders/history?eventId=a'))).json();
      const order = data.orders.find(row => row.id === 'eligible');
      assert.equal(order.can_refund, flag === '1');
      assert.equal(data.orders.find(row => row.id === 'ineligible').can_refund, false);
      assert.deepEqual(order.refund, refund);
      const h = harness('src/components/pos/RefundAction.tsx', { confirm: true });
      const tree = h.render(h.component.RefundAction, {
        orderId: order.id, amountCents: 1000, currency: 'eur', lang: 'fr',
        eligible: order.can_refund, refund: order.refund, onRefresh: () => {},
      });
      assert.equal(findAll(tree, node => node.props?.role === 'dialog').length, flag === '1' ? 1 : 0);
      assert.equal(findAll(tree, node => node.type === 'button').length, flag === '1' ? 4 : 1);
    }
  } finally {
    if (previous === undefined) delete process.env.REFUND_CREATE_ENABLED;
    else process.env.REFUND_CREATE_ENABLED = previous;
  }
});

test('history receipt selection is explicit and single; rendering and loading never print or POST', async () => {
  const rows = [sale('one', 'a', 'NEW'), sale('two', 'a', 'DONE', 'card')];
  const h = harness('src/components/pos/OrderHistory.tsx', { snapshot: { eventId: 'a', offset: 0, orders: rows, hasMore: false } });
  let selected = null, prints = 0;
  const oldWindow = global.window, oldFetch = global.fetch;
  const calls = [];
  global.window = { print: () => prints++, setInterval: () => 1, clearInterval: () => {} };
  global.fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ eventId: 'a', orders: rows, hasMore: false }); };
  const render = () => h.render(h.component.OrderHistory, { eventId: 'a', lang: 'de', selectedOrderId: selected, onSelect: id => { selected = id; } });
  const receipts = tree => findAll(tree, node => node.type?.name === 'OnDemandOrderReceipt');
  try {
    let tree = render();
    assert.equal(receipts(tree).filter(node => node.props.requested).length, 0);
    const cleanup = h.effects[0]();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1); assert.equal(calls[0].options.method, undefined);
    assert.match(calls[0].url, /eventId=a/);
    assert.equal(prints, 0);
    receipts(tree)[0].props.onRequest(); tree = render();
    assert.deepEqual(receipts(tree).filter(node => node.props.requested).map(node => node.props.order.id), ['one']);
    assert.equal(prints, 0);
    receipts(tree)[1].props.onRequest(); tree = render();
    assert.deepEqual(receipts(tree).filter(node => node.props.requested).map(node => node.props.order.id), ['two']);
    receipts(tree)[1].props.onPrint(); assert.equal(prints, 1);
    cleanup();
    const different = h.render(h.component.OrderHistory, { eventId: 'b', lang: 'de', selectedOrderId: 'one', onSelect: () => {} });
    assert.equal(receipts(different).length, 0);
  } finally { global.window = oldWindow; global.fetch = oldFetch; }
});

test('history rejects a response containing another event and suppresses late results after cleanup', async () => {
  const oldWindow = global.window, oldFetch = global.fetch;
  global.window = { setInterval: () => 1, clearInterval: () => {} };
  try {
    for (const abort of [false, true]) {
      let resolve;
      global.fetch = () => new Promise(done => { resolve = done; });
      const h = harness('src/components/pos/OrderHistory.tsx');
      h.render(h.component.OrderHistory, { eventId: 'a', lang: 'de', selectedOrderId: null, onSelect: () => {} });
      const cleanup = h.effects[0]();
      if (abort) cleanup();
      resolve(Response.json({ eventId: 'a', orders: [sale('foreign', 'b', 'NEW')], hasMore: false }));
      await new Promise(done => setImmediate(done));
      assert.equal(h.state.snapshot, null);
      assert.equal(Boolean(h.state.error), !abort);
      cleanup();
    }
  } finally { global.window = oldWindow; global.fetch = oldFetch; }
});

test('manual history remains accessible with a pending card attempt and does not change that attempt', () => {
  const attempt = { orderId: 'pending-two', key: 'same-attempt', published: true, items: [] };
  const h = harness('src/app/caisse/manual/page.tsx', {
    context: { eventId: 'a', eventName: 'Event A', session: { userId: 'user-a', username: 'cashier', role: 'cashier' }, sections: [] },
    cardAttempt: attempt, loading: false,
  });
  let tree = h.render();
  const history = findAll(tree, node => node.type?.name === 'OrderHistory')[0];
  assert.equal(history.props.eventId, 'a');
  assert.equal(history.props.selectedOrderId, null);
  history.props.onSelect('paid-one'); tree = h.render();
  assert.equal(h.state.cardAttempt, attempt);
  assert.equal(h.state.showReceipt, false);
  assert.equal(findAll(tree, node => node.type?.name === 'OrderHistory')[0].props.selectedOrderId, 'paid-one');
  findAll(tree, node => node.type?.name === 'CardPayment')[0].props.onTicket();
  assert.equal(h.state.historyReceiptOrderId, null);
  assert.equal(h.state.showReceipt, true);
  assert.equal(h.state.cardAttempt, attempt);
});

test('old caisse keeps its action journal and coordinates current/history receipts', () => {
  const h = harness('src/app/caisse/page.tsx', {
    isUnlocked: true, staffRole: 'cashier', eventReady: true, selectedEventId: 'a',
    orders: [sale('current', 'a', 'NEW')], loading: false, actionLogs: ['existing action'], receiptOrderId: 'current',
  });
  let tree = h.render();
  findAll(tree, node => node.type?.name === 'OrderHistory')[0].props.onSelect('older');
  tree = h.render();
  assert.equal(h.state.receiptOrderId, null);
  assert.equal(h.state.historyReceiptOrderId, 'older');
  assert.deepEqual(h.state.actionLogs, ['existing action']);
  findAll(tree, node => node.type?.name === 'OnDemandOrderReceipt')[0].props.onRequest();
  assert.equal(h.state.receiptOrderId, 'current');
  assert.equal(h.state.historyReceiptOrderId, null);
});
