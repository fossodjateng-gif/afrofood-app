/* eslint-disable @typescript-eslint/no-require-imports */
// Run with AFROFOOD_PGLITE_MODULE pointing to an isolated PGlite installation.
// No environment files, network credentials or external database are used.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const { load } = require('./ui-harness.cjs');
test('isolated PostgreSQL: migration preserves card rows; actual cash SQL is atomic, unique and total', { skip: !process.env.AFROFOOD_PGLITE_MODULE }, async () => {
  const { PGlite } = require(process.env.AFROFOOD_PGLITE_MODULE);
  const db = new PGlite();
  const previous = process.env.REFUND_CREATE_ENABLED;
  process.env.REFUND_CREATE_ENABLED = '1';
  try {
    await db.exec(`CREATE TABLE orders (
      id TEXT PRIMARY KEY, event_id TEXT, status TEXT, payment TEXT, payment_provider TEXT,
      paid_at TIMESTAMPTZ, stripe_payment_intent_id TEXT, amount_cents INTEGER, currency TEXT,
      items JSONB, quantity_applied BOOLEAN);
    CREATE TABLE staff_users (id TEXT PRIMARY KEY);
    CREATE TABLE order_refunds (
      order_id TEXT PRIMARY KEY REFERENCES orders(id), refund_key TEXT NOT NULL UNIQUE,
      stripe_payment_intent_id TEXT NOT NULL UNIQUE, refund_amount_cents INTEGER NOT NULL CHECK(refund_amount_cents > 0),
      currency TEXT NOT NULL, refund_state TEXT NOT NULL CHECK(refund_state IN ('requested','processing','refunded','requires_review')),
      stripe_refund_id TEXT UNIQUE, refund_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      requested_by TEXT NOT NULL REFERENCES staff_users(id), refunded_at TIMESTAMPTZ, refund_error TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    INSERT INTO staff_users VALUES ('paul'), ('marie');
    INSERT INTO orders VALUES ('card-sale', 'event-x', 'NEW', 'card', 'stripe', NOW(), 'pi_fixture', 100, 'eur', '[{"id":"dip-chili","qty":2}]', TRUE);
    INSERT INTO order_refunds (order_id, refund_key, stripe_payment_intent_id, refund_amount_cents, currency, refund_state, requested_by, stripe_refund_id, refunded_at)
      VALUES ('card-sale','card-key','pi_fixture',100,'eur','refunded','paul','re_fixture',NOW());`);
    await db.exec(fs.readFileSync('scripts/add_refund_request_context.sql', 'utf8'));
    const before = (await db.query('SELECT * FROM order_refunds')).rows[0];
    await db.exec(fs.readFileSync('scripts/add_cash_total_refunds.sql', 'utf8'));
    const migrated = (await db.query('SELECT * FROM order_refunds')).rows[0];
    const { payment_method, ...preserved } = migrated;
    assert.equal(payment_method, 'card');assert.deepEqual(preserved, before);
    await db.exec(`INSERT INTO orders SELECT 'cash-sale','event-x','NEW','cash',NULL,NOW(),NULL,100,'eur',items,TRUE FROM orders WHERE id='card-sale';
      INSERT INTO orders SELECT 'cash-other',event_id,status,payment,payment_provider,paid_at,NULL,amount_cents,currency,items,quantity_applied FROM orders WHERE id='cash-sale';
      CREATE TABLE test_lease (valid BOOLEAN); INSERT INTO test_lease VALUES (TRUE);
      CREATE FUNCTION af_assert_cashier_lease(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
        BEGIN IF NOT (SELECT valid FROM test_lease) THEN RAISE EXCEPTION 'lease revoked'; END IF; RETURN TRUE; END $$;`);
    const originalSale = (await db.query("SELECT * FROM orders WHERE id='cash-sale'")).rows[0];
    // Serialize connection usage as real independent transactions on this embedded single connection.
    let queue = Promise.resolve();
    const schedule = fn => { const next = queue.then(fn);queue = next.catch(() => {});return next; };
    const statement = (strings, values) => ({ text: strings.reduce((q, part, i) => q + part + (i < values.length ? '$' + (i + 1) : ''), ''), values });
    const sql = (strings, ...values) => {
      const query = statement(strings, values);
      return { query, then: (resolve, reject) => schedule(() => db.query(query.text, query.values)).then(r => r.rows).then(resolve, reject) };
    };
    sql.transaction = queries => schedule(async () => {
      await db.exec('BEGIN');
      try {
        const results = [];
        for (const q of queries) results.push((await db.query(q.query.text, q.query.values)).rows);
        await db.exec('COMMIT');return results;
      } catch (e) { await db.exec('ROLLBACK');throw e; }
    });
    const service = load('src/lib/refund-server.ts', { '@/lib/db': { sql }, '@/lib/stripe-server': {
      stripeGet: () => { throw Error('Cash must never call Stripe'); }, stripePost: () => { throw Error('Cash must never call Stripe'); },
    } });
    const user = { id: 'paul', username: 'paul', role: 'cashier', active: true, cashierEventId: 'event-x', workstationId: 'station-x', workstationType: 'cashier' };
    const context = { userId: 'paul', username: 'paul', eventId: 'event-x', workstationId: 'station-x', workstationName: 'Caisse 1', sessionHash: 'fixture', instanceId: 'fixture' };
    const request = () => service.getOrderRefund('cash-sale', user, true, context, 100);
    await assert.rejects(service.getOrderRefund('cash-sale', user, true, context, 50), /refund_invalid_amount/);
    const refunds = await Promise.all([request(), request(), request()]);
    assert.equal(new Set(refunds.map(r => r.refund_key)).size, 1);
    assert.equal(refunds[0].refund_state, 'refunded');assert.equal(refunds[0].refund_amount_cents, 100);
    assert.equal(refunds[0].requested_register_id, 'station-x');assert.equal(refunds[0].requested_by, 'paul');
    assert.deepEqual((await db.query("SELECT * FROM orders WHERE id='cash-sale'")).rows[0], originalSale);
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM order_refunds WHERE order_id='cash-sale'")).rows[0].n, 1);
    await db.exec('UPDATE test_lease SET valid=FALSE');
    await assert.rejects(service.getOrderRefund('cash-other', user, true, context), /lease revoked/);
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM order_refunds WHERE order_id='cash-other'")).rows[0].n, 0);
    // Exercise real CHECK, unique and NOT NULL constraints, not a mock of their behavior.
    for (const [method, pi, refundId, state, refundedAt] of [
      ['card', null, null, 'requested', null], ['other', null, null, 'refunded', new Date()],
      ['cash', 'pi_bad', null, 'refunded', new Date()], ['cash', null, 're_bad', 'refunded', new Date()],
      ['cash', null, null, 'processing', null], ['cash', null, null, 'refunded', null],
    ]) await assert.rejects(db.query(`INSERT INTO order_refunds
      (order_id,refund_key,payment_method,stripe_payment_intent_id,refund_amount_cents,currency,refund_state,requested_by,stripe_refund_id,refunded_at)
      VALUES ('cash-other','bad-key',$1,$2,100,'eur',$3,'paul',$4,$5)`, [method, pi, state, refundId, refundedAt]));
    await db.query(`INSERT INTO order_refunds (order_id,refund_key,payment_method,refund_amount_cents,currency,refund_state,requested_by,refunded_at)
      VALUES ('cash-other','other-key','cash',100,'eur','refunded','marie',NOW())`);
    await assert.rejects(db.query(`INSERT INTO order_refunds (order_id,refund_key,payment_method,refund_amount_cents,currency,refund_state,requested_by,refunded_at)
      VALUES ('cash-other','duplicate-key','cash',100,'eur','refunded','paul',NOW())`), /duplicate key/);
    // The original card refund and its Stripe uniqueness survive cash operations.
    assert.deepEqual((await db.query("SELECT * FROM order_refunds WHERE order_id='card-sale'")).rows[0], migrated);
    await assert.rejects(db.query("UPDATE order_refunds SET stripe_payment_intent_id='pi_fixture', payment_method='card' WHERE order_id='cash-other'"), /duplicate key/);
    await db.exec(`ALTER TABLE orders
      ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW(), ADD COLUMN customer_name TEXT,
      ADD COLUMN event_name TEXT, ADD COLUMN reservation_requested BOOLEAN, ADD COLUMN reservation_time TIMESTAMPTZ,
      ADD COLUMN cash_received_cents INTEGER, ADD COLUMN change_given_cents INTEGER, ADD COLUMN payment_error TEXT,
      ADD COLUMN pos_card_state TEXT, ADD COLUMN pos_card_key TEXT, ADD COLUMN pos_cash_key TEXT,
      ADD COLUMN created_by TEXT, ADD COLUMN created_by_username TEXT, ADD COLUMN register_id TEXT, ADD COLUMN register_name TEXT,
      ADD COLUMN paid_by TEXT, ADD COLUMN paid_by_username TEXT, ADD COLUMN paid_register_id TEXT, ADD COLUMN paid_register_name TEXT;
      INSERT INTO orders (id,event_id,status,payment,paid_at,amount_cents,currency,items)
        VALUES ('cash-normal','event-x','NEW','cash',NOW(),100,'eur','[]');`);
    // Actual history/order SELECTs must propagate both refund methods without reconciling.
    class StaffAuthError extends Error {}
    const mocks = { '@/lib/db': { sql }, '@/lib/staff-session-server': {
      requireAssignedCashRegister: async () => user, requireStaffWorkstation: async () => user, StaffAuthError,
    }, '@/lib/orders-schema': { ensureOrdersSchema: async () => {} },
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } } };
    const history = load('src/app/api/orders/history/route.ts', mocks);
    const response = await history.GET(new Request('https://fixture.test/api/orders/history?eventId=event-x'));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.orders.find(o => o.id === 'cash-sale').refund.paymentMethod, 'cash');
    assert.equal(data.orders.find(o => o.id === 'card-sale').refund.paymentMethod, 'card');
    assert.equal(data.orders.find(o => o.id === 'cash-sale').can_refund, false);
    assert.equal(data.orders.find(o => o.id === 'cash-normal').can_refund, true);
    const orders = load('src/app/api/orders/route.ts', mocks);
    const listing = await orders.GET(new Request('https://fixture.test/api/orders?eventId=event-x'));
    assert.equal(listing.status, 200);
    const listed = await listing.json();
    assert.equal(listed.find(o => o.id === 'cash-sale').refund.state, 'refunded');
    assert.equal(listed.find(o => o.id === 'card-sale').refund.paymentMethod, 'card');
    assert.equal(listed.find(o => o.id === 'cash-normal').refund, null);
  } finally {
    if (previous === undefined) delete process.env.REFUND_CREATE_ENABLED;else process.env.REFUND_CREATE_ENABLED = previous;
    await db.close();
  }
});
