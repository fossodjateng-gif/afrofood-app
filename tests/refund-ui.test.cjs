/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { harness, findAll, load } = require('./ui-harness.cjs');
const text = tree => tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join(' ') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
const props = { orderId: 'ORDER-X', amountCents: 1250, currency: 'eur', eligible: true, refund: null, onRefresh: () => {} };
for (const [lang, action, confirm, refunded] of [['de', 'Rückerstattung', 'Gesamten Betrag erstatten', 'Erstattet'], ['fr', 'Remboursement', 'Rembourser le montant total', 'Remboursé'], ['en', 'Refund', 'Refund full amount', 'Refunded']]) {
  test(`Refund ${lang}: explicit confirmation, double-click exclusion, no automatic request/print`, async () => {
    const saved = global.fetch, calls = [];
    global.fetch = async (url, options) => { calls.push([url, options]);return Response.json({ ok: true, refund: { state: 'refunded', amountCents: 1250, currency: 'eur', refundedAt: '2026-10-21T10:00:00Z' } }); };
    try {
      const h = harness('src/components/pos/RefundAction.tsx', {}, { '@/lib/staff-auth': { getSession: () => ({ userId: 'paul' }), staffFetch: (...args) => fetch(...args) } });
      const render = extra => h.render(h.component.RefundAction, { ...props, lang, ...extra });
      let tree = render();assert.equal(calls.length, 0);
      findAll(tree, node => node.type === 'button' && text(node) === action)[0].props.onClick();tree = render();
      assert.ok(text(tree).includes('ORDER-X'));assert.equal(calls.length, 0);
      const button = findAll(tree, node => node.type === 'button' && text(node) === confirm)[0];button.props.onClick();button.props.onClick();
      for (let n = 0; n < 4; n++) await new Promise(resolve => setImmediate(resolve));
      assert.equal(calls.length, 1);assert.equal(calls[0][1].method, 'POST');assert.equal(calls[0][1].headers['x-staff-user-id'], 'paul');
      assert.ok(text(render()).includes(refunded));
      const fresh = harness('src/components/pos/RefundAction.tsx');
      assert.ok(text(fresh.render(fresh.component.RefundAction, { ...props, lang, refund: { state: 'refunded', amountCents: 1250, currency: 'eur', refundedAt: '2026-10-21T10:00:00Z' } })).includes(refunded));
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

test('Refund UI displays order, paid/refunded/remaining amounts and never offers review or unauthorized creation', () => {
  for (const state of ['processing', 'refunded', 'requires_review', 'requested']) {
    const h = harness('src/components/pos/RefundAction.tsx');
    const tree = h.render(h.component.RefundAction, { ...props, lang: 'fr', eligible: false, refund: { state, amountCents: 1250, currency: 'eur', refundedAt: null } });
    const content = text(tree);
    for (const label of ['ORDER-X', 'Montant payé carte', 'Déjà remboursé', 'Encore remboursable']) assert.ok(content.includes(label));
    assert.equal(findAll(tree, node => node.type === 'button' && ['Remboursement', 'Reprendre le même remboursement', 'Rembourser le montant total'].includes(text(node))).length, 0);
    const values = findAll(tree, node => node.type === 'dd').map(text);
    assert.equal(values[1].includes('12,50'), state === 'refunded');
    assert.equal(values[2].includes('12,50'), ['processing', 'requested'].includes(state));
    if (state === 'requires_review') assert.deepEqual(values.slice(1), ['À vérifier', 'À vérifier']);
  }
});

test('Refund UI sends only the confirmed amount through staffFetch and does not display premature success', async () => {
  const calls = [];
  const h = harness('src/components/pos/RefundAction.tsx', {}, { '@/lib/staff-auth': {
    getSession: () => ({ userId: 'paul' }),
    staffFetch: async (...args) => { calls.push(args);return Response.json({ ok: true, refund: { state: 'processing', amountCents: 1250, currency: 'eur', refundedAt: null } }); },
  } });
  const render = () => h.render(h.component.RefundAction, { ...props, lang: 'fr' });
  findAll(render(), n => n.type === 'button' && text(n) === 'Remboursement')[0].props.onClick();
  findAll(render(), n => n.type === 'button' && text(n) === 'Rembourser le montant total')[0].props.onClick();
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(calls[0][1].body), { amountCents: 1250 });
  assert.equal(text(findAll(render(), n => n.props.role === 'status')[0]).includes('en cours'), true);
  assert.equal(findAll(render(), n => n.type === 'button' && text(n) === 'Remboursement').length, 0);
});

test('cash confirmation names the full order, physical cash return and sends no item or quantity selection', async () => {
  const calls = [];
  const h = harness('src/components/pos/RefundAction.tsx', {}, { '@/lib/staff-auth': {
    getSession: () => ({ userId: 'paul' }),
    staffFetch: async (...args) => { calls.push(args);return Response.json({ ok: true, refund: { state: 'refunded', paymentMethod: 'cash', amountCents: 1250, currency: 'eur', refundedAt: '2026-10-26T12:00:00Z' } }); },
  } });
  const render = () => h.render(h.component.RefundAction, { ...props, payment: 'cash', lang: 'fr' });
  assert.equal(calls.length, 0);
  findAll(render(), n => n.type === 'button' && text(n) === 'Remboursement')[0].props.onClick();
  const dialog = findAll(render(), n => n.props.role === 'dialog')[0];
  assert.match(text(dialog), /ORDER-X/);assert.match(text(dialog), /12,50/);assert.match(text(dialog), /espèces/);
  assert.equal(findAll(dialog, n => ['input','select'].includes(n.type)).length, 0);
  const confirm = findAll(dialog, n => n.type === 'button' && text(n) === 'Rembourser le montant total')[0];
  confirm.props.onClick();confirm.props.onClick();
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);assert.deepEqual(JSON.parse(calls[0][1].body), { amountCents: 1250 });
  assert.equal(findAll(render(), n => n.type === 'button' && ['Remboursement','Rembourser le montant total','Reprendre le même remboursement'].includes(text(n))).length, 0);
  const status = findAll(render(), n => typeof n.type === 'function' && n.type.name === 'RefundStatus')[0];
  assert.equal(status.props.refund.paymentMethod, 'cash');assert.equal(status.props.amountCents, 1250);
});
