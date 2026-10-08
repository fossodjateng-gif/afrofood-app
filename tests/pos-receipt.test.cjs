/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(relative, mocks = {}, cache = new Map()) {
  const filename = path.resolve(relative);
  if (cache.has(filename)) return cache.get(filename);
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule.exports);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = name => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (!name.startsWith('@/')) return require(name);
    const stem = 'src/' + name.slice(2);
    return load(stem + (fs.existsSync(stem + '.ts') ? '.ts' : '.tsx'), mocks, cache);
  };
  new Function('require', 'module', 'exports', source)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const receipt = { id: '20260925-003', created_at: '2026-09-25T12:00:00Z', event_id: 'event-a', event_name: 'Event A', payment: 'cash', status: 'NEW', amount_cents: 3700, cash_received_cents: 5000, change_given_cents: 1300, items: [
  { id: 'meal', name: 'Meal', price: 36, qty: 1, pricingKind: 'regular' },
  { id: 'dip-green', name: 'Green', price: 7, qty: 1, pricingKind: 'dip' },
  { id: 'custom-mango', name: 'Mango', price: 7, qty: 1, pricingKind: 'dip' },
] };
const labels = { ticketTitle: 'Kundenbeleg', ticketSub: 'Bezahlt', order: 'Bestellung', name: 'Name', payment: 'Zahlung', total: 'Gesamt', ticketLegend: 'Allergene', ticketSent: 'Küche', thanks: 'Danke', reprint: 'Beleg drucken' };

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (Array.isArray(tree)) { for (const child of tree) { const found = find(child, predicate);if (found) return found; }return null; }
  if (predicate(tree)) return tree;
  return find(tree.props?.children, predicate);
}

test('F/G: reçu partagé affiche numéro, articles, quantités, dips, total enregistré, cash et événement', () => {
  const { OrderReceipt } = load('src/components/OrderReceipt.tsx', {
    'next/image': props => React.createElement('img', { src: props.src, alt: props.alt }),
    'qrcode.react': { QRCodeCanvas: props => React.createElement('span', { 'data-qr': props.value }) },
  });
  let prints = 0;
  const props = { order: receipt, lang: 'de', labels, showEvent: true, onPrint: () => prints++ };
  const markup = renderToStaticMarkup(React.createElement(OrderReceipt, props));
  for (const text of [receipt.id, 'Meal', 'Green', 'Mango', 'x1 - 36.00 EUR', 'x1 - 0.00 EUR', 'x1 - 1.00 EUR', '37.00 EUR', 'cash', 'Event A', 'Allergene']) assert.ok(markup.includes(text), text);
  assert.equal(prints, 0);
  find(OrderReceipt(props), element => element.type === 'button').props.onClick();
  assert.equal(prints, 1);
  const persisted = renderToStaticMarkup(React.createElement(OrderReceipt, { ...props, order: { ...receipt, amount_cents: 3650 } }));
  assert.ok(persisted.includes('36.50 EUR'));
});

test('D/E/F/H: succès sans ticket automatique, ticket à la demande et nouvelle vente dans le même contexte', async () => {
  // Execute the real page and callbacks with an in-memory hook/storage harness.
  // Browser APIs and the payment transport are mocked; no real sale is made.
  const values = [], effects = [];let cursor = 0, mounting = true, payments = 0, prints = 0, navigations = 0;
  const hooks = {
    useState: initial => { const index = cursor++;if (!(index in values)) values[index] = initial;return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }]; },
    useRef: initial => { const index = cursor++;if (!(index in values)) values[index] = { current: initial };return values[index]; },
    useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => { if (mounting) effects.push(fn); },
  };
  const session = { userId: 'cashier', role: 'cashier', username: 'Kasse', cashierEventId: 'event-a' };
  const storage = new Map();
  const previous = Object.fromEntries(['window', 'localStorage', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, print: () => prints++, location: { set href(value) { navigations++; } } };
    globalThis.fetch = async () => Response.json({ ok: true, storeConfig: { events: [{ id: 'event-a', name: 'Event A' }] }, sections: [{ id: 'food', title: { de: 'Food' }, items: [{ id: 'meal', name: { de: 'Meal' }, price: 36, visible: true }] }] });
    const realCash = load('src/lib/pos-cash.ts');
    const Page = load('src/app/caisse/manual/page.tsx', {
      react: hooks, 'next/link': () => null, 'next/image': () => null,
      '@/lib/staff-auth': { getSession: () => session, resolveCashierEventId: s => s.cashierEventId, getStaffRoleLabel: () => 'Kasse' },
      '@/lib/translations': { getSavedLang: () => 'de', saveLang: () => {} },
      '@/lib/pos-cash': { ...realCash, confirmPosCash: async () => { payments++;await Promise.resolve();return receipt; } },
    }).default;
    const render = () => { cursor = 0;return Page(); };
    const settle = () => new Promise(resolve => setImmediate(resolve));
    let tree = render();mounting = false;
    effects.forEach(effect => effect());await settle();tree = render();
    const component = name => find(tree, element => element.type?.name === name);
    component('ProductGrid').props.onAdd({ id: 'meal' });tree = render();
    component('PosCart').props.onCash();tree = render();
    component('CashPayment').props.onReceived('50');tree = render();
    component('CashPayment').props.onConfirm();component('CashPayment').props.onConfirm();
    await settle();tree = render();
    assert.equal(payments, 1);
    assert.equal(component('CashPayment').props.receipt.id, receipt.id);
    assert.equal(component('OrderReceipt'), null);
    assert.equal(prints, 0);assert.equal(navigations, 0);
    assert.equal(storage.get('af_pos_cart_v1:cashier:event-a'), '[]');
    assert.equal(storage.has('af_pos_cart_v1:cashier:event-a:cash-attempt'), false);
    // Actual success buttons keep the primary action first and ticket secondary.
    const panel = component('CashPayment').type(component('CashPayment').props);
    const newButton = find(panel, el => el.type === 'button' && el.props.children === 'Neue Bestellung');
    const ticketButton = find(panel, el => el.type === 'button' && el.props.children === 'Beleg / Ticket');
    assert.equal(newButton.props.className, 'af-btn');assert.match(ticketButton.props.className, /af-link-btn/);
    // Finish the first sale without requesting any receipt.
    newButton.props.onClick();tree = render();
    assert.equal(component('CashPayment'), null);assert.equal(component('OrderReceipt'), null);
    assert.deepEqual(component('PosCart').props.items, []);
    assert.ok(component('ProductGrid'));assert.equal(prints, 0);assert.equal(navigations, 0);
    // The next customer can pay immediately with the same user/event.
    component('ProductGrid').props.onAdd({ id: 'meal' });tree = render();
    component('PosCart').props.onCash();tree = render();
    component('CashPayment').props.onReceived('50');tree = render();
    component('CashPayment').props.onConfirm();await settle();tree = render();
    assert.equal(payments, 2);assert.equal(component('OrderReceipt'), null);
    ticketButton.props.onClick();tree = render();
    assert.equal(component('OrderReceipt').props.order, receipt);
    assert.equal(prints, 0);assert.equal(navigations, 0);
    newButton.props.onClick();tree = render();
    assert.equal(component('CashPayment'), null);assert.equal(component('OrderReceipt'), null);
    assert.deepEqual(component('PosCart').props.items, []);
    assert.ok(component('ProductGrid'));assert.equal(session.userId, 'cashier');assert.equal(session.cashierEventId, 'event-a');
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor);else delete globalThis[key]; }
  }
});
