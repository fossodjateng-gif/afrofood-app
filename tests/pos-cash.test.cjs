/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute the actual TypeScript modules with all database writes mocked.
function load(relative, mocks = {}, cache = new Map()) {
  const filename = path.resolve(relative);
  if (cache.has(filename)) return cache.get(filename);
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule.exports);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => name in mocks ? mocks[name]
    : name.startsWith('@/') ? load('src/' + name.slice(2) + '.ts', mocks, cache) : require(name);
  new Function('require', 'module', 'exports', source)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const cash = load('src/lib/pos-cash.ts');
const meal = { id: 'meal', name: 'Meal', price: 10, qty: 1 };
function backend() {
  const orders = new Map(), events = []; let consumed = 0, failStock = false, stockError = null, consumeCalls = 0;
  const sql = async (strings, ...v) => {
    const q = strings.join('');
    if (q.includes('WHERE id LIKE')) return [...orders.values()].filter(r => r.id.startsWith(v[0].slice(0, -1))).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 1).map(r => ({ id: r.id }));
    if (q.includes('INSERT INTO orders')) {
      if (!q.includes('pos_cash_key')) {
        const row = { id: v[0], event_id: v[3], event_name: v[4], payment: v[7], amount_cents: v[8], items: JSON.parse(v[9]), status: 'PENDING_PAYMENT' };
        assert.ok(![...orders.values()].some(r => r.id === row.id));
        orders.set(row.id, row);return [];
      }
      if (orders.has(v[5]) || [...orders.values()].some(r => r.id === v[0])) return [];
      const row = { id: v[0], event_id: v[1], event_name: v[2], payment: 'cash', amount_cents: v[3], items: JSON.parse(v[4]), pos_cash_key: v[5], pos_cash_fingerprint: v[6], pos_cash_state: 'creating', status: 'PENDING_PAYMENT', cash_received_cents: null, change_given_cents: null };
      orders.set(row.pos_cash_key, row);return [{ ...row }];
    }
    if (q.includes('WHERE pos_cash_key')) return orders.has(v[0]) ? [{ ...orders.get(v[0]) }] : [];
    if (q.includes("pos_cash_state = 'ready'")) { const row = [...orders.values()].find(r => r.id === v[0]);row.pos_cash_state = 'ready';return [{ ...row }]; }
    if (q.includes("pos_cash_state = 'failed'")) { const row = [...orders.values()].find(r => r.id === v[0]);row.pos_cash_state = 'failed';row.status = 'CANCELED';return []; }
    if (q.includes('UPDATE orders SET status')) {
      const row = [...orders.values()].find(r => r.id === v[2]);
      if (row.status !== 'PENDING_PAYMENT' || row.cash_received_cents !== null) return [];
      row.status = 'NEW';row.cash_received_cents = v[0];row.change_given_cents = v[1];return [{ ...row }];
    }
    if (q.includes('WHERE id =')) return [...orders.values()].filter(r => r.id === v[0]).map(r => ({ ...r }));
    if (q.includes('WHERE UPPER(status)')) return [...orders.values()].filter(r => r.status === v[0] && r.event_id === v[1]).map(r => ({ ...r }));
    return [];
  };
  const mocks = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/db': { sql }, '@/lib/orders-schema': { ensureOrdersSchema: async () => {} },
    '@/lib/order-events': { publishOrderEvent: event => events.push(event) },
    '@/lib/menu-settings': {
      getPaymentConfig: async () => ({ cashEnabled: true }),
      getResolvedMenuSections: async () => [{ id: 'food', items: [ { ...meal, name: { de: 'Meal' }, visible: true }, { id: 'normal36', name: { de: '36 EUR' }, price: 36, visible: true } ] }, { id: 'dips', items: ['dip-green', 'custom-mango'].map(id => ({ id, name: { de: id }, price: 7, visible: true })) }],
      consumeItemAvailability: async () => { consumeCalls++; if (stockError) throw stockError; if (failStock) throw Error('Item limited: meal'); consumed++; },
      restoreItemAvailability: async () => {},
    },
  };
  const post = load('src/app/api/orders/route.ts', mocks);
  const patch = load('src/app/api/orders/[id]/status/route.ts', mocks);
  const request = async (url, options) => {
    const req = new Request('http://localhost' + url, options);
    return url === '/api/orders' ? post.POST(req) : patch.PATCH(req, { params: Promise.resolve({ id: decodeURIComponent(url.split('/')[3]) }) });
  };
  return { orders, events, request, get consumed() { return consumed; }, get consumeCalls() { return consumeCalls; }, set stockError(value) { stockError = value; }, set failStock(value) { failStock = value; }, get: url => post.GET(new Request(url)) };
}
const attempt = (total = 1000, items = [meal]) => ({ key: require('node:crypto').randomUUID(), userId: 'cashier', role: 'cashier', eventId: 'event-a', eventName: 'Event A', items, amountCents: total });
for (const [label, total, received, change] of [['A',1000,1000,0], ['B',1000,2000,1000], ['C',3700,5000,1300]]) test(label + ': total, reçu et monnaie persistés', async () => {
  const db = backend();const items = total === 3700 ? [{ ...meal, id: 'normal36', price: 36 }, { ...meal, id: 'dip-green', price: 0 }, { ...meal, id: 'custom-mango', price: 99 }] : [meal];
  const receipt = await cash.confirmPosCash(attempt(total, items), received, () => {}, db.request);
  assert.equal(receipt.amount_cents, total);assert.equal(receipt.cash_received_cents, received);assert.equal(receipt.change_given_cents, change);assert.equal(receipt.status, 'NEW');assert.equal(db.consumed, 1);
});
test('D: montant insuffisant refusé par client et serveur', async () => {
  const db = backend(), sale = attempt();await assert.rejects(cash.confirmPosCash(sale, 900, () => {}, db.request));assert.equal(db.orders.size, 0);
  const response = await db.request('/api/orders', { method: 'POST', headers: { 'x-staff-role': 'cashier' }, body: JSON.stringify({ ...sale, posCashKey: sale.key, payment: 'cash' }) });
  const created = await response.json();const paid = await db.request('/api/orders/' + created.order.id + '/status', { method: 'PATCH', body: JSON.stringify({ status: 'NEW', cashReceivedCents: 900 }) });assert.equal(paid.status,400);assert.equal([...db.orders.values()][0].status,'PENDING_PAYMENT');
});
test('E: requêtes concurrentes et répétées = une création et une confirmation', async () => {
  const db = backend(), sale = attempt();const options = { method: 'POST', headers: { 'x-staff-role': 'cashier' }, body: JSON.stringify({ ...sale, posCashKey: sale.key, payment: 'cash' }) };
  await Promise.all([db.request('/api/orders', options), db.request('/api/orders', options)]);
  assert.equal(db.orders.size,1);assert.equal(db.consumed,1);
  await Promise.all([cash.confirmPosCash({ ...sale },2000,()=>{},db.request),cash.confirmPosCash({ ...sale },2000,()=>{},db.request)]);
  assert.equal(db.events.filter(e=>e.type==='PAYMENT_VALIDATED').length,1);
  [...db.orders.values()][0].status = 'READY';await cash.confirmPosCash(sale,5000,()=>{},db.request);
  assert.equal([...db.orders.values()][0].status,'READY');assert.equal([...db.orders.values()][0].cash_received_cents,2000);
});
test('F: réponse de création perdue puis erreur de confirmation, reprise de la même commande', async () => {
  const db = backend(), sale = attempt();let lost = true;
  const request = async (url, options) => { const res = await db.request(url, options);if (lost) { lost = false;throw Error('response lost'); }return res; };
  await assert.rejects(cash.confirmPosCash(sale,2000,()=>{},request));assert.equal(sale.orderId,undefined);assert.equal(sale.items.length,1);
  let lostPayment = true;const afterPayment = async (url, options) => { const res = await db.request(url,options);if (url.includes('/status') && lostPayment) { lostPayment = false;throw Error('ack lost'); }return res; };
  await assert.rejects(cash.confirmPosCash(sale,2000,()=>{},afterPayment));assert.ok(sale.orderId);
  const result = await cash.confirmPosCash(sale,2000,()=>{},db.request);assert.equal(result.status,'NEW');assert.equal(db.orders.size,1);assert.equal(db.consumed,1);assert.equal(db.events.filter(e=>e.type==='PAYMENT_VALIDATED').length,1);
});
test('G/H: 36 EUR + deux dips = 37 EUR, NEW uniquement dans le bon événement', async () => {
  const db = backend(), items = [{...meal,id:'normal36',price:36},{...meal,id:'dip-green',price:0},{...meal,id:'custom-mango',price:99}];
  const receipt = await cash.confirmPosCash(attempt(3700,items),5000,()=>{},db.request);
  const matching = await (await db.get('http://localhost/api/orders?status=NEW&eventId=event-a')).json();const other = await (await db.get('http://localhost/api/orders?status=NEW&eventId=event-b')).json();assert.equal(matching.length,1);assert.equal(other.length,0);assert.equal(matching[0].amount_cents,3700);
  assert.equal(matching[0].id, receipt.id);
  assert.match(matching[0].id, /^\d{8}-\d{3,}$/);
});
test('montant serveur augmenté: aucune confirmation avant un reçu suffisant', async () => {
  const db = backend(), sale = attempt(500);
  await assert.rejects(cash.confirmPosCash(sale,500,()=>{},db.request), /Serverbetrag/);assert.equal(sale.amountCents,1000);assert.ok(sale.orderId);assert.equal([...db.orders.values()][0].status,'PENDING_PAYMENT');
  await cash.confirmPosCash(sale,1000,()=>{},db.request);assert.equal(db.orders.size,1);
});
test('validation stock refusée: panier conservé, aucune commande NEW', async () => {
  const db = backend();db.failStock = true;const sale = attempt();await assert.rejects(cash.confirmPosCash(sale,1000,()=>{},db.request));assert.equal(sale.items.length,1);assert.equal([...db.orders.values()][0].status,'CANCELED');
});
test('saisie décimale exacte et raccourcis jamais inférieurs au total', () => {
  assert.equal(cash.parseReceivedCents('50,00'),5000);assert.equal(cash.parseReceivedCents('10.01'),1001);for(const bad of ['-1','NaN','2.001','1e3',''])assert.equal(cash.parseReceivedCents(bad),null);assert.deepEqual(cash.quickCashAmounts(3700),[3700,5000,10000]);
});

test('stock: résultat réseau incertain reste bloqué et ne consomme jamais une deuxième fois', async () => {
  const db = backend(), sale = attempt();db.stockError = Error('fetch failed');
  await assert.rejects(cash.confirmPosCash(sale,1000,()=>{},db.request));
  await assert.rejects(cash.confirmPosCash(sale,1000,()=>{},db.request));
  assert.equal(db.orders.size,1);assert.equal(db.consumeCalls,1);assert.equal([...db.orders.values()][0].status,'PENDING_PAYMENT');
});
test('une clé déjà utilisée ne peut être réutilisée avec un autre panier', async () => {
  const db = backend(), sale = attempt();await cash.confirmPosCash(sale,1000,()=>{},db.request);
  const altered = { ...sale, orderId: undefined, items: [{...meal,qty:2}], amountCents:2000 };
  await assert.rejects(cash.confirmPosCash(altered,2000,()=>{},db.request));assert.equal(db.orders.size,1);assert.equal(db.consumed,1);
});

test('A/C: Menu et deux ventes POS partagent les numéros normaux successifs', async () => {
  const db = backend();
  const normal = await (await db.request('/api/orders', { method: 'POST', body: JSON.stringify({ eventId: 'event-a', payment: 'cash', items: [meal] }) })).json();
  assert.equal(normal.ok, true);
  const first = await cash.confirmPosCash(attempt(), 1000, () => {}, db.request);
  const second = await cash.confirmPosCash(attempt(), 1000, () => {}, db.request);
  assert.match(first.id, /^\d{8}-\d{3,}$/);
  assert.equal(first.id.split('-')[0], normal.order.id.split('-')[0]);
  assert.equal(Number(first.id.split('-')[1]), Number(normal.order.id.split('-')[1]) + 1);
  assert.equal(Number(second.id.split('-')[1]), Number(first.id.split('-')[1]) + 1);
  assert.equal(db.orders.size, 3);
});

test('B: rechargement après réponse perdue retrouve exactement le même numéro', async () => {
  const db = backend(), sale = attempt();
  const lostResponse = async (url, options) => { await db.request(url, options);throw Error('response lost'); };
  await assert.rejects(cash.confirmPosCash(sale, 2000, () => {}, lostResponse));
  const original = [...db.orders.values()][0];
  const reloaded = JSON.parse(JSON.stringify(sale));
  const receipt = await cash.confirmPosCash(reloaded, 2000, () => {}, db.request);
  assert.equal(receipt.id, original.id);
  assert.equal(original.pos_cash_key, sale.key);
  assert.notEqual(receipt.id, sale.key);
  assert.equal(db.orders.size, 1);
  assert.equal(db.consumed, 1);
});

test('H: deux tentatives distinctes concurrentes réservent des numéros distincts', async () => {
  const db = backend();
  const receipts = await Promise.all([cash.confirmPosCash(attempt(), 1000, () => {}, db.request), cash.confirmPosCash(attempt(), 1000, () => {}, db.request)]);
  assert.notEqual(receipts[0].id, receipts[1].id);
  assert.equal(Math.abs(Number(receipts[0].id.split('-')[1]) - Number(receipts[1].id.split('-')[1])), 1);
  assert.equal(db.consumed, 2);
  assert.equal(db.orders.size, 2);
});
