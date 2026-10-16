/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');

// Offline transaction model. Executes the production helper's query batches;
// this is not a PostgreSQL parser or a substitute for real lock/SQL tests.
function transactionalSql(base, state) {
  const settings = state.settings ||= new Map();
  let tail = Promise.resolve();
  const sql = (strings, ...values) => ({
    query: strings.join(''), values,
    then(resolve, reject) { return Promise.resolve().then(() => base(strings, ...values)).then(resolve, reject); },
  });
  sql.transaction = queries => {
    const run = async () => {
      const ordersBefore = structuredClone(state.orders);
      const settingsBefore = structuredClone(settings);
      let applied = false;
      try {
        const results = [];
        for (const { query: q, values: v } of queries) {
          if (q.includes('pg_advisory_xact_lock')) {
            assert.equal(v[0], 'afrofood:availability:v1');results.push([]);
          } else if (q.includes('WITH candidate AS MATERIALIZED')) {
            assert.match(q, /FOR UPDATE/);
            assert.match(q, /previous_quantity_applied IS FALSE/);
            assert.match(q, /GREATEST\(0::numeric/);
            const row = [...state.orders.values()].find(row => row.id === v[0]);
            const method = v[6], received = v[2], pi = v[8], amount = v[9], currency = v[10];
            const valid = row && row.status === 'PENDING_PAYMENT' && !row.paid_at && row.payment === method
              && (!row.pos_card_key || row.pos_card_state === 'ready') && (!row.pos_cash_key || row.pos_cash_state === 'ready')
              && (method !== 'card' || (row.stripe_payment_intent_id === pi && row.amount_cents === amount && row.currency === currency))
              && (received === null || (received >= row.amount_cents && received >= 0)) && (!row.pos_cash_key || received !== null);
            if (!valid) { results.push([]);continue; }
            if (row.quantity_applied === false) {
              const quantities = new Map();
              for (const item of row.items) quantities.set(item.id, (quantities.get(item.id) || 0) + item.qty);
              const key = 'item_availability' + (row.event_id ? ':' + row.event_id : '');
              const entries = settings.get(key) || {};
              for (const [id, qty] of quantities) {
                const entry = entries[id];
                if (entry?.status === 'limited' && (!entry.resumeAt || new Date(entry.resumeAt).getTime() > Date.now())) {
                  entry.remainingQty = Math.max(0, (entry.remainingQty || 0) - qty);
                }
              }
              row.quantity_applied = true;applied = true;
            }
            row.status = 'NEW';row.paid_at = new Date().toISOString();row.payment_error = null;
            if (method === 'card') row.payment_provider = 'stripe';
            if (received !== null) { row.cash_received_cents = received;row.change_given_cents = received - row.amount_cents; }
            results.push([{ id: row.id }]);
          } else if (q.includes('INSERT INTO app_settings')) {
            const [key, id, next, expected] = v;
            const entries = settings.get(key) || {};
            if (JSON.stringify(entries[id] ?? null) !== JSON.stringify(JSON.parse(expected))) { results.push([]);continue; }
            entries[id] = JSON.parse(next);settings.set(key, entries);results.push([{ setting_key: key }]);
          } else if (q.includes('SELECT * FROM orders')) {
            const row = [...state.orders.values()].find(row => row.id === v[0]);results.push(row ? [structuredClone(row)] : []);
          } else throw Error('Unmodelled transaction: ' + q);
        }
        state.beforeCommit?.();
        if (applied) state.onApplied?.();
        return results;
      } catch (error) {
        state.orders.clear();for (const [key, row] of ordersBefore) state.orders.set(key, row);
        settings.clear();for (const [key, entries] of settingsBefore) settings.set(key, entries);
        throw error;
      }
    };
    const result = tail.then(run);tail = result.catch(() => {});return result;
  };
  return sql;
}
module.exports = { transactionalSql };
