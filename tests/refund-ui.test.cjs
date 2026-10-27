/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, findAll, load } = require('./ui-harness.cjs');
const text = tree => tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join(' ') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
const props = { orderId: 'ORDER-X', amountCents: 1250, currency: 'eur', eligible: true, refund: null, onRefresh: () => {} };
const statusTree = tree => {
  const status = findAll(tree, node => node.type?.name === 'RefundStatus')[0];
  assert.ok(status, 'The history uses the shared refund status');
  return status.type(status.props);
};
for (const [lang, action, confirm, refunded, paid] of [['de', 'Gesamten Betrag erstatten', 'Gesamten Betrag erstatten', 'ERSTATTET', 'BEZAHLT'], ['fr', 'Rembourser intégralement', 'Rembourser le montant total', 'REMBOURSÉE', 'PAYÉE'], ['en', 'Refund full amount', 'Refund full amount', 'REFUNDED', 'PAID']]) {
  test(`Refund ${lang}: explicit confirmation, double-click exclusion, no automatic request/print`, async () => {
    const saved = global.fetch, calls = [];
    global.fetch = async (url, options) => { calls.push([url, options]);return Response.json({ ok: true, refund: { state: 'refunded', amountCents: 1250, currency: 'eur', refundedAt: '2026-10-21T10:00:00Z' } }); };
    try {
      const h = harness('src/components/pos/RefundAction.tsx', {}, { '@/lib/staff-auth': { getSession: () => ({ userId: 'paul' }), staffFetch: (...args) => fetch(...args) } });
      const render = extra => h.render(h.component.RefundAction, { ...props, lang, ...extra });
      let tree = render();assert.equal(calls.length, 0);
      assert.equal(text(statusTree(tree)).trim(), paid);
      findAll(tree, node => node.type === 'button' && text(node) === action)[0].props.onClick();tree = render();
      assert.ok(text(tree).includes('ORDER-X'));assert.equal(calls.length, 0);
      const dialog = findAll(tree, node => node.props?.role === 'dialog')[0];
      assert.equal(findAll(dialog, node => ['input', 'select'].includes(node.type)).length, 0);
      const button = findAll(dialog, node => node.type === 'button' && text(node) === confirm)[0];button.props.onClick();button.props.onClick();
      for (let n = 0; n < 4; n++) await new Promise(resolve => setImmediate(resolve));
      assert.equal(calls.length, 1);assert.equal(calls[0][1].method, 'POST');assert.equal(calls[0][1].headers['x-staff-user-id'], 'paul');
      assert.ok(text(statusTree(render())).includes(refunded));
      const fresh = harness('src/components/pos/RefundAction.tsx');
      assert.ok(text(statusTree(fresh.render(fresh.component.RefundAction, { ...props, lang, refund: { state: 'refunded', amountCents: 1250, currency: 'eur', refundedAt: '2026-10-21T10:00:00Z' } }))).includes(refunded));
    } finally { global.fetch = saved; }
  });
}
test('server client session ignores forged localStorage, uses single login and waits for logout', async () => {
  const previous = { fetch: global.fetch, window: global.window, localStorage: global.localStorage };
  const values = new Map([['af_staff_session_v1', JSON.stringify({ role: 'admin', userId: 'fake' })]]);
  const calls = [];
  global.window = {};global.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  global.fetch = async (url, options = {}) => { calls.push([url, options]);return Response.json(options.method === 'DELETE' ? { ok: true } : { ok: true, user: { id: 'paul', username: 'paul', role: 'cashier', cashierEventId: 'event-x' } }); };
  try {
    const auth = load('src/lib/staff-auth.ts');assert.equal(auth.getSession(), null);
    assert.equal((await auth.login('paul', 'fixture-only-password')).session.userId, 'paul');
    assert.equal(values.has('af_staff_session_v1'), false);assert.equal(auth.resolveCashierEventId(auth.getSession()), 'event-x');
    await auth.clearSession();assert.equal(auth.getSession(), null);assert.equal(calls.at(-1)[1].method, 'DELETE');
    assert.ok([...values.values()].every(value => !/fixture-only-password/.test(value)));
  } finally { Object.assign(global, previous); }
});

test('Refund UI compact history keeps sale identity, one status, ticket/details and authorized recovery actions', async () => {
  const paidAt = '2026-10-26T20:40:00Z', refundedAt = '2026-10-26T21:05:00Z';
  for (const payment of ['cash', 'card']) for (const confirmed of [false, true]) {
    const order = { id: 'ORDER-X', event_id: 'event-x', event_name: 'Festival', payment,
      created_at: paidAt, paid_at: paidAt, amount_cents: 1250, currency: 'eur', status: 'READY',
      created_by_username: 'creator', paid_by_username: 'cashier', register_name: 'Desk 1', paid_register_name: 'Desk 2',
      items: [{ name: 'Meal', qty: 2 }], can_refund: !confirmed,
      refund: confirmed ? { state: 'refunded', paymentMethod: payment, amountCents: 1250, currency: 'eur', refundedAt } : null };
    const history = harness('src/components/pos/OrderHistory.tsx', { snapshot: { eventId: 'event-x', offset: 0, orders: [order], hasMore: false } });
    const article = findAll(history.render(history.component.OrderHistory, { eventId: 'event-x', lang: 'fr', selectedOrderId: null, onSelect() {} }), node => node.type === 'article')[0];
    const primary = { ...article, props: { ...article.props, children: article.props.children.filter(node => node?.type !== 'details') } };
    assert.match(text(primary), /ORDER-X/);
    assert.match(text(primary), payment === 'cash' ? /Espèces/ : /Carte/);
    assert.match(text(primary), /12,50/);
    const saleTime = findAll(primary, node => node.type === 'time')[0];
    assert.equal(saleTime.props.dateTime, paidAt);assert.match(text(saleTime), /\d{2}:\d{2}/);
    assert.equal(text(primary).includes('Montant original'), confirmed);
    assert.doesNotMatch(text(primary), /Meal|creator|cashier|Desk 1|Desk 2/);
    assert.doesNotMatch(text(article), /Montant payé|Déjà remboursé|Encore remboursable/);
    const details = findAll(article, node => node.type === 'details')[0];
    assert.ok(!details.props.open);assert.equal(text(findAll(details, node => node.type === 'summary')[0]), 'Détails');
    for (const value of ['Meal', '2', 'Prête', 'creator', 'cashier', 'Desk 1', 'Desk 2']) assert.ok(text(details).includes(value));
    const action = findAll(article, node => node.type?.name === 'RefundAction')[0];
    const h = harness('src/components/pos/RefundAction.tsx');
    const actionTree = h.render(h.component.RefundAction, action.props), status = statusTree(actionTree);
    assert.equal(findAll(status, node => node.props?.role === 'status').length, 1);
    assert.match(text(status), confirmed ? /REMBOURSÉE/ : /PAYÉE/);
    assert.equal(findAll(actionTree, node => node.type === 'button' && text(node) === 'Rembourser intégralement').length, confirmed ? 0 : 1);
    const times = findAll(status, node => node.type === 'time');
    assert.equal(times.length, confirmed ? 1 : 0);
    if (confirmed) { assert.equal(times[0].props.dateTime, refundedAt);assert.match(text(times[0]), /\d{2}:\d{2}/); }
    const receipt = findAll(article, node => node.type?.name === 'OnDemandOrderReceipt')[0];
    assert.equal(receipt.props.order, order);assert.equal(receipt.props.requested, false);
    const r = harness('src/components/OnDemandOrderReceipt.tsx');
    const receiptTree = r.render(r.component.OnDemandOrderReceipt, receipt.props);
    assert.equal(findAll(receiptTree, node => node.type === 'button' && text(node) === 'Reçu / Ticket').length, 1);
    assert.equal(findAll(receiptTree, node => node.type?.name === 'OrderReceipt').length, 0);
  }
  const labels = { requested: 'Remboursement demandé', processing: 'Remboursement en cours', failed: 'Remboursement échoué', requires_review: 'Vérification nécessaire', refunded: 'REMBOURSÉE' };
  for (const [state, label] of Object.entries(labels)) for (const eligible of [false, true]) {
    const calls = [];
    const h = harness('src/components/pos/RefundAction.tsx', {}, { '@/lib/staff-auth': {
      getSession: () => ({ userId: 'paul' }),
      staffFetch: async (...args) => { calls.push(args);return Response.json({ ok: true, refund: { state, amountCents: 1250, currency: 'eur', refundedAt } }); },
    } });
    const render = () => h.render(h.component.RefundAction, { ...props, lang: 'fr', eligible, refund: { state, amountCents: 1250, currency: 'eur', refundedAt } });
    const tree = render(), status = statusTree(tree);
    assert.ok(text(status).includes(label));assert.equal(text(status).includes('REMBOURSÉE'), state === 'refunded');
    assert.equal(findAll(status, node => node.type === 'time').length, state === 'refunded' ? 1 : 0);
    assert.equal(findAll(tree, node => node.type === 'button' && text(node) === 'Rembourser intégralement').length, 0);
    const resume = findAll(tree, node => node.type === 'button' && text(node) === 'Reprendre le même remboursement');
    assert.equal(resume.length, state === 'requested' && eligible ? 1 : 0);
    const checks = findAll(tree, node => node.type === 'button' && text(node) === 'Vérifier le remboursement');
    assert.equal(checks.length, state === 'refunded' ? 0 : 1);
    assert.equal(calls.length, 0);
    if (checks.length) { await checks[0].props.onClick(); await new Promise(resolve => setImmediate(resolve));assert.equal(calls.length, 1);assert.equal(calls[0][1].method, 'GET'); }
    if (resume.length) { resume[0].props.onClick();assert.equal(findAll(render(), node => node.props?.role === 'dialog').length, 1);assert.equal(calls.length, 1); }
  }
  for (const lang of ['fr', 'de', 'en']) {
    const h = harness('src/components/pos/RefundAction.tsx');
    assert.equal(findAll(h.render(h.component.RefundAction, { ...props, lang, eligible: false }), node => node.type === 'button').length, 0);
  }
});

test('Refund UI sends only the confirmed amount through staffFetch and does not display premature success', async () => {
  const calls = [];
  const h = harness('src/components/pos/RefundAction.tsx', {}, { '@/lib/staff-auth': {
    getSession: () => ({ userId: 'paul' }),
    staffFetch: async (...args) => { calls.push(args);return Response.json({ ok: true, refund: { state: 'processing', amountCents: 1250, currency: 'eur', refundedAt: null } }); },
  } });
  const render = () => h.render(h.component.RefundAction, { ...props, lang: 'fr' });
  findAll(render(), n => n.type === 'button' && text(n) === 'Rembourser intégralement')[0].props.onClick();
  findAll(render(), n => n.type === 'button' && text(n) === 'Rembourser le montant total')[0].props.onClick();
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(calls[0][1].body), { amountCents: 1250 });
  assert.equal(text(statusTree(render())).includes('en cours'), true);
  assert.equal(findAll(render(), n => n.type === 'button' && text(n) === 'Rembourser intégralement').length, 0);
});

test('cash confirmation names the full order, physical cash return and sends no item or quantity selection', async () => {
  const calls = [];
  const h = harness('src/components/pos/RefundAction.tsx', {}, { '@/lib/staff-auth': {
    getSession: () => ({ userId: 'paul' }),
    staffFetch: async (...args) => { calls.push(args);return Response.json({ ok: true, refund: { state: 'refunded', paymentMethod: 'cash', amountCents: 1250, currency: 'eur', refundedAt: '2026-10-26T12:00:00Z' } }); },
  } });
  const render = () => h.render(h.component.RefundAction, { ...props, payment: 'cash', lang: 'fr' });
  assert.equal(calls.length, 0);
  findAll(render(), n => n.type === 'button' && text(n) === 'Rembourser intégralement')[0].props.onClick();
  const dialog = findAll(render(), n => n.props.role === 'dialog')[0];
  assert.match(text(dialog), /ORDER-X/);assert.match(text(dialog), /12,50/);assert.match(text(dialog), /espèces/);
  assert.equal(findAll(dialog, n => ['input','select'].includes(n.type)).length, 0);
  const confirm = findAll(dialog, n => n.type === 'button' && text(n) === 'Rembourser le montant total')[0];
  confirm.props.onClick();confirm.props.onClick();
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);assert.deepEqual(JSON.parse(calls[0][1].body), { amountCents: 1250 });
  assert.equal(findAll(render(), n => n.type === 'button' && ['Rembourser intégralement','Rembourser le montant total','Reprendre le même remboursement'].includes(text(n))).length, 0);
  const status = findAll(render(), n => typeof n.type === 'function' && n.type.name === 'RefundStatus')[0];
  assert.equal(status.props.refund.paymentMethod, 'cash');assert.equal(status.props.refund.amountCents, 1250);
  assert.match(text(statusTree(render())), /REMBOURSÉE/);
});
