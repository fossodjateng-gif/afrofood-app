/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');
function refundHarness() {
  const user = { id: 'paul', username: 'paul', role: 'cashier', active: true, cashierEventId: 'event-x' };
  const order = { id: 'ORDER-X', payment: 'card', payment_provider: 'stripe', paid_at: '2026-10-21T10:00:00Z', status: 'READY', event_id: 'event-x', stripe_payment_intent_id: 'pi_fixture', amount_cents: 1250, currency: 'eur', quantity_applied: true, items: [{ id: 'meal', qty: 2 }] };
  const intent = { id: order.stripe_payment_intent_id, status: 'succeeded', amount: 1250, amount_received: 1250, currency: 'eur', metadata: { order_id: order.id } };
  const rows = new Map(), stripeRefunds = new Map(), keys = new Map(), calls = [], queries = [];
  const h = { user, order, intent, rows, stripeRefunds, keys, calls, queries, failGet: false, loseCreate: false, failSave: false, responsePatch: null, pages: null, pending: false, beforeCreate: null };
  const sql = async (strings, ...v) => {
    const q = strings.join('');queries.push(q);
    assert.doesNotMatch(q, /UPDATE orders|DELETE FROM orders|app_settings|quantity_applied\s*=|status\s*=\s*'NEW'|terminal_active_orders/);
    if (q.includes('SELECT * FROM orders')) return v[0] === order.id ? [structuredClone(order)] : [];
    if (q.includes('INSERT INTO order_refunds')) {
      if (!rows.has(v[0]) && ![...rows.values()].some(row => row.stripe_payment_intent_id === v[2])) rows.set(v[0], {
        order_id: v[0], refund_key: v[1], stripe_payment_intent_id: v[2], refund_amount_cents: v[3], currency: v[4], requested_by: v[5],
        refund_state: 'requested', stripe_refund_id: null, refund_requested_at: new Date().toISOString(), refunded_at: null, refund_error: null,
      });return [];
    }
    if (q.includes('UPDATE order_refunds')) {
      if (h.failSave) { h.failSave = false; throw Error('simulated DB commit failure'); }
      const [state, error, refundId, , orderId, key, , expectedId] = v;
      const row = rows.get(orderId);
      if (row && row.refund_key === key && row.refund_state !== 'refunded' && (state !== 'requested' || row.refund_state === 'requested') && (!row.stripe_refund_id || row.stripe_refund_id === expectedId)) {
        row.refund_state = state;row.refund_error = error;row.stripe_refund_id ||= refundId;
        if (state === 'refunded') row.refunded_at ||= new Date().toISOString();
      }return [];
    }
    if (q.includes('SELECT * FROM order_refunds')) {
      const row = q.includes('WHERE stripe_payment_intent_id') ? [...rows.values()].find(row => row.stripe_payment_intent_id === v[0]) : rows.get(v[0]);
      return row ? [structuredClone(row)] : [];
    }
    throw Error('Unmocked refund SQL: ' + q);
  };
  const stripe = {
    stripeGet: async path => {
      calls.push(['GET', path]);if (h.failGet) throw Error('simulated read timeout');
      if (path.startsWith('/payment_intents/')) return structuredClone(intent);
      if (path.startsWith('/refunds/')) return structuredClone(stripeRefunds.get(decodeURIComponent(path.slice(9))));
      if (path.startsWith('/refunds?')) {
        if (h.pages) return h.pages(new URL('https://fixture.test' + path).searchParams);
        return { data: structuredClone([...stripeRefunds.values()]), has_more: false };
      }throw Error('Unmocked Stripe path');
    },
    stripePost: async (path, body, key) => {
      calls.push(['POST', path, body, key]);assert.equal(path, '/refunds');assert.equal(body.amount, order.amount_cents);
      if (h.beforeCreate) await h.beforeCreate();
      if (!keys.has(key)) {
        const refund = { id: 're_fixture_' + (keys.size + 1), payment_intent: body.payment_intent, amount: body.amount, currency: 'eur', status: h.pending ? 'pending' : 'succeeded', metadata: { order_id: body['metadata[order_id]'], refund_key: body['metadata[refund_key]'] }, ...h.responsePatch };
        keys.set(key, refund);stripeRefunds.set(refund.id, refund);
      }
      if (h.loseCreate) { h.loseCreate = false;throw Error('lost response after refund succeeded'); }
      return structuredClone(keys.get(key));
    },
  };
  const mocks = { '@/lib/db': { sql }, '@/lib/stripe-server': stripe, 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } } };
  const cache = new Map();
  const service = load('src/lib/refund-server.ts', mocks, cache);
  Object.assign(h, { sql, stripe, mocks, cache, service, request: (actor = user) => service.getOrderRefund(order.id, actor, true), read: () => service.getOrderRefund(order.id, user, false) });
  return h;
}
module.exports = { refundHarness };
