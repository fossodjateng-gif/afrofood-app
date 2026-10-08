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
const pricing = load('src/lib/pricing.ts');
const cart = load('src/lib/cart.ts');
const pos = load('src/lib/pos-cart.ts');
const order = load('src/lib/order.ts');
const product = (id, price, pricingKind = 'regular') => ({ id, name: id, price, pricingKind, qty: 1 });
const green = product('dip-green', 0, 'dip');
const chili = product('dip-chili', 9, 'dip');
const custom = product('custom-mango', 7.5, 'dip');
const normal = product('meal', 36);
const sections = [
  { id: 'dips', items: [green, chili, custom] },
  { id: 'food', items: [normal, product('custom-chili-dish', 12)] },
];
const cases = [
  ['aucun dip', [normal], 3600],
  ['1 dip', [green], 0],
  ['2 dips différents', [green, chili], 100],
  ['3 dips différents', [green, chili, custom], 200],
  ['4 unités', [{ ...green, qty: 4 }], 300],
  ['même dip x2', [{ ...green, qty: 2 }], 100],
  ['même dip x3', [{ ...chili, qty: 3 }], 200],
  ['36 EUR + 2 dips', [normal, green, chili], 3700],
  ['dip personnalisé x3 (prix configuré 7,50)', [{ ...custom, qty: 3 }], 200],
  ['plat avec sauce chili reste un plat', [product('custom-chili-dish', 12)], 1200],
];
async function server(items, expected) {
  let insert, consumed, catalogEvent;
  const route = load('src/app/api/orders/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/db': { sql: async (strings, ...values) => { if (strings.join('').includes('INSERT INTO orders')) insert = values; return []; } },
    '@/lib/orders-schema': { ensureOrdersSchema: async () => {} },
    '@/lib/order-events': { publishOrderEvent: () => {} },
    '@/lib/menu-settings': {
      getPaymentConfig: async () => ({ cashEnabled: true, cardEnabled: true, cashlessEnabled: true }),
      getResolvedMenuSections: async (eventId) => { catalogEvent = eventId; return sections; },
      consumeItemAvailability: async (canonical) => { consumed = canonical; },
    },
  });
  const response = await route.POST(new Request('http://localhost/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment: 'cash', eventId: 'test-event', items, amountCents: 1 }),
  }));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.order.amountCents, expected);
  assert.equal(catalogEvent, 'test-event');
  assert.ok(insert.includes(expected));
  assert.equal(pricing.calculateOrderTotalCents(consumed), expected);
  assert.equal(pricing.getOrderBreakdownEur(body.order.items, body.order.amountCents).total * 100, expected);
  return body.order;
}
for (const [name, items, expected] of cases) test(name + ': client / POS / reçu / POST', async () => {
  assert.equal(pricing.calculateOrderTotalCents(items), expected);
  assert.equal(cart.cartTotal(items) * 100, expected);
  assert.equal(pos.getPosBreakdown(items).totalCents, expected);
  const ticket = order.cartToTicketItems(items);
  assert.equal(pricing.getOrderBreakdownEur(ticket).total * 100, expected);
  assert.equal(pricing.getOrderPriceBreakdown(items).lineTotalsCents.reduce((a, b) => a + b, 0), expected);
  await server(ticket, expected);
});
test('serveur ignore prix, classification et montant client falsifiés', async () => {
  await server([{ ...normal, price: 0, pricingKind: 'dip' }, { ...custom, price: 900, pricingKind: 'regular', qty: 2 }], 3700);
});
test('détection standard sans metadata et ancien reçu sans ID', () => {
  assert.equal(pricing.calculateOrderTotalCents([{ id: 'dip-green', name: 'anything', qty: 2, price: 0 }]), 100);
  assert.equal(pricing.calculateOrderTotalCents([{ name: 'Grüne Sauce (mild)', qty: 3, price: 5 }]), 200);
  assert.equal(pricing.isDipItem({ id: 'custom-chili-dish', name: 'Chili sauce chicken', pricingKind: 'regular' }), false);
});
test('quantités + / -, suppression du premier dip, ajout ensuite', async () => {
  const storage = new Map();
  global.window = {};
  global.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const add = (p) => cart.addToCart({ ...p, redSauce: false, extraRedSauceQty: 0 });
  const check = async (expected) => {
    const items = cart.getCart();
    assert.equal(cart.cartTotal(items) * 100, expected);
    assert.equal(pos.getPosBreakdown(items).totalCents, expected);
    await server(order.cartToTicketItems(items), expected);
  };
  add(green); await check(0);
  cart.incrementItem(green.id); await check(100);
  cart.incrementItem(green.id); await check(200);
  cart.decrementItem(green.id); await check(100);
  add(chili); await check(200);
  cart.removeItem(green.id); await check(0);
  add(custom); await check(100);
  const asPos = (p) => ({ ...p, name: { de: p.name, fr: p.name, en: p.name }, visible: true, basePrice: p.price });
  let items = [];
  items = pos.addPosProduct(items, asPos(green));
  items = pos.addPosProduct(items, asPos(green));
  assert.equal(pos.getPosBreakdown(items).totalCents, 100);
  items = pos.decreasePosProduct(items, green.id);
  assert.equal(pos.getPosBreakdown(items).totalCents, 0);
  items = pos.addPosProduct(items, asPos(custom));
  items = items.filter((item) => item.id !== green.id);
  assert.equal(pos.getPosBreakdown(items).totalCents, 0);
  items = pos.addPosProduct(items, asPos(chili));
  await server(items, 100);
  delete global.window; delete global.localStorage;
});
test('catalogue identifie les dips personnalisés par section enregistrée', async () => {
  const settings = load('src/lib/menu-settings.ts', { '@/lib/db': { sql: async (strings) => {
    const query = strings.join('');
    return query.includes('FROM custom_menu_items') ? [{ item_id: 'custom-mango', section_id: 'dips', name_de: 'Mango', name_fr: 'Mangue', name_en: 'Mango', price: 7.5, visible: true }] : [];
  } } });
  const resolved = await settings.getResolvedMenuSections('test-event');
  const mango = resolved.find((section) => section.id === 'dips').items.find((item) => item.id === 'custom-mango');
  assert.equal(mango.pricingKind, 'dip');
  assert.equal(mango.price, 7.5);
  assert.equal(pricing.calculateOrderTotalCents([{ ...mango, name: mango.name.fr, qty: 2 }]), 100);
});
test('total du reçu respecte le montant déjà enregistré', () => {
  assert.equal(pricing.getOrderBreakdownEur([normal], 3500).total, 35);
});
