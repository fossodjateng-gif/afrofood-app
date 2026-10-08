/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const ts = require('typescript');
const { load } = require('./ui-harness.cjs');
const { backend } = require('./card-backend-harness.cjs');

async function withNamespace(prefix, run) {
  const previous = process.env.AFROFOOD_ORDER_ID_PREFIX;
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-10-08T12:00:00Z'])); }
    static now() { return new RealDate('2026-10-08T12:00:00Z').getTime(); }
  };
  if (prefix === undefined) delete process.env.AFROFOOD_ORDER_ID_PREFIX;
  else process.env.AFROFOOD_ORDER_ID_PREFIX = prefix;
  try { await run(); } finally {
    globalThis.Date = RealDate;
    if (previous === undefined) delete process.env.AFROFOOD_ORDER_ID_PREFIX;
    else process.env.AFROFOOD_ORDER_ID_PREFIX = previous;
  }
}

function numbering(ids = []) {
  const patterns = [];
  const { makeNextOrderId } = load('src/lib/order-number.ts', {
    '@/lib/db': { sql: async (_strings, pattern) => {
      patterns.push(pattern);
      return ids.filter(id => id.startsWith(pattern.slice(0, -1)))
        .sort().reverse().slice(0, 1).map(id => ({ id }));
    } },
  });
  return { ids, patterns, makeNextOrderId };
}

for (const prefix of [undefined, '', '   ']) {
  test(`production numbering remains unchanged for ${JSON.stringify(prefix)}`, async () => {
    await withNamespace(prefix, async () => {
      const db = numbering(['POSCARDTEST-20261008-009', '20261007-099']);
      assert.equal(await db.makeNextOrderId(), '20261008-001');
      db.ids.push('20261008-001');
      assert.equal(await db.makeNextOrderId(), '20261008-002');
      assert.deepEqual(db.patterns, ['20261008-%', '20261008-%']);
    });
  });
}

test('test numbering has its own daily namespace and sequential IDs', async () => {
  await withNamespace('POSCARDTEST', async () => {
    const db = numbering(['20261008-001', '20261008-099', 'POSCARDTEST-20261007-042', 'OTHER-20261008-099']);
    for (const expected of ['POSCARDTEST-20261008-001', 'POSCARDTEST-20261008-002']) {
      const id = await db.makeNextOrderId();
      assert.equal(id, expected);
      db.ids.push(id);
    }
    assert.deepEqual(db.patterns, ['POSCARDTEST-20261008-%', 'POSCARDTEST-20261008-%']);
  });
});

test('invalid namespaces cannot introduce SQL LIKE wildcards', async () => {
  for (const prefix of ['TEST%', 'TEST_', 'TEST/OTHER']) {
    await withNamespace(prefix, async () => {
      const db = numbering();
      await assert.rejects(db.makeNextOrderId(), /Invalid AFROFOOD_ORDER_ID_PREFIX/);
      assert.equal(db.patterns.length, 0);
    });
  }
});

test('cashier date fallback accepts production and prefixed IDs', () => {
  const source = fs.readFileSync('src/app/caisse/page.tsx', 'utf8');
  const fn = source.match(/function isTodayOrder\([\s\S]*?\n}/)[0];
  const compiled = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const isTodayOrder = new Function(`${compiled}; return isTodayOrder;`)();
  for (const id of ['20261008-001', 'POSCARDTEST-20261008-001']) {
    assert.equal(isTodayOrder({ id, created_at: 'invalid' }, '20261008'), true);
    assert.equal(isTodayOrder({ id, created_at: 'invalid' }, '20261009'), false);
  }
});

test('prefixed POS card ID survives preparation, native API lookup and signed webhook', async () => {
  await withNamespace('POSCARDTEST', async () => {
    const db = backend();
    const card = load('src/lib/pos-card.ts');
    const sale = { key: crypto.randomUUID(), userId: 'test-user', username: 'test-terminal', role: 'cashier', eventId: 'event-a', eventName: '', items: [{ id: 'dip-green', qty: 1 }, { id: 'dip-chili', qty: 1 }], amountCents: 100, createdAt: Date.now() };
    sale.fingerprint = await card.makeCardFingerprint(sale);
    await card.preparePosCard(sale, () => {}, db.request);
    const id = 'POSCARDTEST-20261008-001';
    assert.equal(sale.orderId, id);
    const intent = [...db.intents.values()][0];
    assert.equal(intent.metadata.order_id, id);
    assert.equal([...db.intents.keys()][0], `afrofood-terminal:${id}:v1`);
    const active = await (await db.request('/api/terminal-active-order?username=test-terminal')).json();
    assert.equal(active.activeOrder.orderId, id);
    const nativeOrder = await (await db.request(`/api/orders?id=${encodeURIComponent(id)}`)).json();
    assert.equal(nativeOrder[0].id, id);
    const sdk = await (await db.request('/api/stripe/terminal/payment-intent', { method: 'POST', body: JSON.stringify({ orderId: id }) })).json();
    assert.equal(sdk.orderId, id);
    assert.equal(sdk.paymentIntentId, intent.id);
    assert.equal(db.stripeCreates, 1);
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const secret = 'mock-signature-only';
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    try {
      const payload = JSON.stringify({ id: 'evt_mock', type: 'payment_intent.succeeded', data: { object: { ...intent, status: 'succeeded', amount_received: 100 } } });
      const timestamp = String(Date.now() / 1000);
      const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
      const response = await db.webhook.POST(new Request('http://localhost/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` }, body: payload }));
      assert.equal(response.status, 200);
      assert.equal(db.orders.get(id).status, 'NEW');
      assert.equal((await card.checkPosCard(sale, db.request)).id, id);
      assert.ok(db.events.some(event => event.type === 'PAYMENT_VALIDATED' && event.orderId === id));
      const { OrderReceipt } = load('src/components/OrderReceipt.tsx');
      const ticket = OrderReceipt({ order: db.orders.get(id), lang: 'de', labels: {}, onPrint: () => {} });
      assert.equal(ticket.props['data-order-id'], id);
      const { makeQrPayload } = load('src/lib/order.ts');
      assert.ok(makeQrPayload({ id, items: [], payment: 'card' }).includes(id));
    } finally {
      if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
      else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
    }
  });
});
