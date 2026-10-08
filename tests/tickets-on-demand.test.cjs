/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { harness, load, findAll } = require('./ui-harness.cjs');

const receipt = { id: '20260925-003', created_at: new Date().toISOString(), customer_name: null, event_id: 'event-a', event_name: 'Event A', payment: 'cash', status: 'NEW', amount_cents: 3700, items: [
  { id: 'meal', name: 'Meal', price: 36, qty: 1, pricingKind: 'regular', note: 'Sans tomates', unitNotes: ['Sauce à part'] },
  { id: 'dip-green', name: 'Green', price: 7, qty: 1, pricingKind: 'dip' },
  { id: 'custom-mango', name: 'Mango', price: 7, qty: 1, pricingKind: 'dip' },
] };
const labels = { ticketTitle: 'Kundenbeleg', ticketSub: 'Bezahlt', order: 'Bestellung', name: 'Name', payment: 'Zahlung', total: 'Gesamt', ticketLegend: 'Allergene', ticketSent: 'Küche', thanks: 'Danke', reprint: 'Beleg drucken' };
const components = (tree, name) => findAll(tree, el => el.type?.name === name);

test('G/I/K/N: clic explicite, traductions, isolation entre commandes et garde des données', () => {
  for (const [lang, label] of [['de', 'Beleg / Ticket'], ['fr', 'Reçu / Ticket'], ['en', 'Receipt / Ticket']]) {
    const h = harness('src/components/OnDemandOrderReceipt.tsx');
    let prints = 0;
    const props = { order: receipt, lang, labels, onPrint: () => prints++ };
    const render = p => h.render(h.component.OnDemandOrderReceipt, p);
    let tree = render(props);
    assert.equal(components(tree, 'OrderReceipt').length, 0);
    const button = findAll(tree, el => el.type === 'button')[0];
    assert.equal(button.props.children, label);
    button.props.onClick();tree = render(props);
    assert.equal(components(tree, 'OrderReceipt')[0].props.order.id, receipt.id);
    assert.equal(prints, 0);
    components(tree, 'OrderReceipt')[0].props.onPrint();assert.equal(prints, 1);
    const other = { ...props, order: { ...receipt, id: '20260925-004' } };
    tree = render(other);assert.equal(components(tree, 'OrderReceipt').length, 0);
    findAll(tree, el => el.type === 'button')[0].props.onClick();tree = render(other);
    assert.equal(components(tree, 'OrderReceipt')[0].props.order.id, other.order.id);
    for (const invalid of [null, { ...receipt, id: '' }, { ...receipt, amount_cents: undefined }, { ...receipt, items: [] }]) assert.equal(h.component.hasReceiptData(invalid), false);
    assert.equal(render({ ...props, order: { ...receipt, amount_cents: undefined } }), null);
    const { CashPayment } = load('src/components/pos/CashPayment.tsx');
    const cashPanel = CashPayment({ receipt, lang, totalCents: 3700, received: '50', onNew: () => {}, onTicket: () => {} });
    assert.ok(findAll(cashPanel, el => el.type === 'button' && el.props.children === label).length);
  }
});

test('H/I/M/N: caisse après validation, aucune ouverture ou impression, choix du reçu de chaque commande', async () => {
  const previousWindow = globalThis.window, previousFetch = globalThis.fetch;
  let prints = 0, patches = 0;const timers = [];
  const pending = { ...receipt, status: 'PENDING_PAYMENT' };
  const other = { ...receipt, id: '20260925-004' };
  try {
    globalThis.window = { print: () => prints++, setTimeout: fn => { timers.push(fn); } };
    globalThis.fetch = async (url, options) => {
      if (options?.method === 'PATCH') { patches++;return Response.json({ ok: true, order: receipt }); }
      return Response.json([receipt, other]);
    };
    const h = harness('src/app/caisse/page.tsx', { isUnlocked: true, staffRole: 'cashier', eventReady: true, selectedEventId: 'event-a', orders: [pending, other], loading: false });
    let tree = h.render();
    const validate = findAll(tree, el => el.type === 'button' && el.props.children === 'Barzahlung bestaetigen')[0];
    assert.ok(validate);await validate.props.onClick();
    for (const fn of timers.splice(0)) await fn();
    await new Promise(resolve => setImmediate(resolve));
    tree = h.render();
    assert.equal(patches, 1);assert.equal(prints, 0);
    let controls = components(tree, 'OnDemandOrderReceipt');
    assert.equal(controls.length, 2);assert.ok(controls.every(el => !el.props.requested));
    assert.equal(components(tree, 'OrderReceipt').length, 0);
    controls.find(el => el.props.order.id === receipt.id).props.onRequest();tree = h.render();
    controls = components(tree, 'OnDemandOrderReceipt');
    assert.deepEqual(controls.filter(el => el.props.requested).map(el => el.props.order.id), [receipt.id]);
    controls.find(el => el.props.order.id === other.id).props.onRequest();tree = h.render();
    controls = components(tree, 'OnDemandOrderReceipt');
    assert.deepEqual(controls.filter(el => el.props.requested).map(el => el.props.order.id), [other.id]);
    assert.equal(patches, 1);assert.equal(prints, 0);
    controls.find(el => el.props.requested).props.onPrint();assert.equal(prints, 1);
  } finally { globalThis.window = previousWindow;globalThis.fetch = previousFetch; }
});

test('J/K/L: panier utilise uniquement la commande enregistrée, avec données réelles et sans création au clic', () => {
  const customerOrder = { id: receipt.id, createdAt: receipt.created_at, items: receipt.items, payment: receipt.payment, amountCents: receipt.amount_cents, eventName: receipt.event_name };
  const h = harness('src/app/cart/page.tsx', { cart: [{ id: 'other', name: 'Other basket item', price: 99, qty: 1 }], order: null, orderStatus: null });
  assert.equal(components(h.render(), 'OnDemandOrderReceipt').length, 0);
  h.state.order = customerOrder;h.state.orderStatus = 'NEW';
  let tree = h.render();let control = components(tree, 'OnDemandOrderReceipt')[0];
  assert.equal(control.props.order.id, receipt.id);
  assert.deepEqual(control.props.order.items, receipt.items);
  assert.equal(control.props.order.amount_cents, 3700);
  assert.equal(control.props.order.payment, 'cash');
  assert.equal(components(tree, 'OrderReceipt').length, 0);
  h.state.cart = [];
  assert.equal(components(h.render(), 'OnDemandOrderReceipt')[0].props.order.id, receipt.id);
  const wrapper = harness('src/components/OnDemandOrderReceipt.tsx');
  const render = props => wrapper.render(wrapper.component.OnDemandOrderReceipt, props);
  tree = render(control.props);findAll(tree, el => el.type === 'button')[0].props.onClick();tree = render(control.props);
  assert.equal(components(tree, 'OrderReceipt')[0].props.order.id, receipt.id);
  h.state.order = { ...customerOrder, id: '20260925-004' };control = components(h.render(), 'OnDemandOrderReceipt')[0];
  assert.equal(components(render(control.props), 'OrderReceipt').length, 0);
  assert.equal(control.props.order.id, '20260925-004');
  h.state.order = { ...customerOrder, amountCents: undefined };control = components(h.render(), 'OnDemandOrderReceipt')[0];
  assert.equal(render(control.props), null);
});

test('M: tous les window.print sont dans une action explicite, aucun effet ou timer ne peut imprimer', () => {
  for (const file of ['src/app/caisse/manual/page.tsx', 'src/app/caisse/page.tsx', 'src/app/cart/page.tsx']) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let calls = 0;
    function walk(node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'window.print') {
        calls++;let ancestor = node.parent;
        while (ancestor && !ts.isFunctionDeclaration(ancestor) && !ts.isArrowFunction(ancestor)) ancestor = ancestor.parent;
        assert.ok(ancestor, file);
        if (ts.isFunctionDeclaration(ancestor)) assert.equal(ancestor.name.text, 'printTicket');
        else { assert.ok(ts.isJsxExpression(ancestor.parent));assert.equal(ancestor.parent.parent.name.text, 'onPrint'); }
      }
      ts.forEachChild(node, walk);
    }
    walk(source);assert.equal(calls, 1, file);
  }
});
