/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');
const { staffHarness } = require('./staff-auth-harness.cjs');

for (const role of [null, 'paul', 'kitchen', 'admin']) {
  test(`stats uses server admin session: ${role || 'anonymous'}`, async () => {
    const h = await staffHarness();
    const cookie = role ? (await h.login(role)).cookie : '';
    let reads = 0;
    const api = load('src/app/api/stats/route.ts', { ...h.mocks,
      '@/lib/db': { sql: async () => { reads++; return []; } },
      '@/lib/orders-schema': { ensureOrdersSchema: async () => {} },
    }, h.cache);
    const result = await api.GET(new Request('https://afro.test/api/stats', { headers: { cookie, 'x-staff-role': 'admin' } }));
    assert.equal(result.status, role === 'admin' ? 200 : role ? 403 : 401);
    assert.equal(reads > 0, role === 'admin');
  });
}
for (const role of ['paul', 'kitchen', 'admin']) {
  test(`global custom product deletion: ${role}`, async () => {
    const h = await staffHarness(); const { cookie } = await h.login(role);
    let deleted = 0, availability = 0;
    const api = load('src/app/api/admin/menu-config/route.ts', { ...h.mocks,
      '@/lib/menu-settings': { deleteCustomMenuItem: async () => { deleted++; }, upsertItemAvailability: async () => { availability++; return "next"; }, getCustomItemIds: async () => ['custom-test'] },
      '@/lib/menu-catalog': { getCatalogItemIds: () => ['custom-test'] },
    }, h.cache);
    const request = setting => new Request('https://afro.test/api/admin/menu-config', { method: 'PATCH', headers: { cookie, origin: 'https://afro.test', 'x-staff-role': 'admin' }, body: JSON.stringify({ setting, itemId: 'custom-test', eventId: 'event-x', status: 'available', expectedRevision: 'before' }) });
    assert.equal((await api.PATCH(request('custom_item_delete'))).status, role === 'admin' ? 200 : 403);
    assert.equal(deleted, role === 'admin' ? 1 : 0);
    assert.equal((await api.PATCH(request('item_availability'))).status, 200);
    assert.equal(availability, 1);
  });
}
for (const suffix of ['', '&status=READY']) {
  test(`public tracking ignores revoked cookie; private POS remains private ${suffix}`, async () => {
    const h = await staffHarness(); const { cookie } = await h.login('paul');
    await h.api.DELETE(h.req('DELETE', cookie));
    const rows = [{ id: 'public', status: 'READY', event_id: 'event-x' }, { id: 'private', status: 'READY', event_id: 'event-x', pos_card_key: 'key' }, { id: 'cash', status: 'READY', event_id: 'event-x', pos_cash_key: 'key' }];
    const api = load('src/app/api/orders/route.ts', { ...h.mocks,
      '@/lib/db': { sql: async (strings, ...values) => {
        const q = strings.join(''); assert.match(q, /pos_card_key IS NULL AND pos_cash_key IS NULL/);
        const staff = values.at(-1);
        return rows.filter(row => row.id === values[0] && (staff || (!row.pos_card_key && !row.pos_cash_key)));
      } }, '@/lib/orders-schema': { ensureOrdersSchema: async () => {} },
      '@/lib/pos-cash-server': {}, '@/lib/pos-card-server': {},
    }, h.cache);
    for (const currentCookie of ['', cookie]) {
      for (const id of ['public', 'private', 'cash']) {
        const response = await api.GET(new Request(`https://afro.test/api/orders?id=${id}${suffix}`, { headers: { cookie: currentCookie } }));
        assert.equal(response.status, 200);
        assert.equal((await response.json()).length, id === 'public' ? 1 : 0);
      }
    }
    for (const url of ['?id=public', '?id=private', '']) {
      const response = await api.GET(new Request(`https://afro.test/api/orders${url}`, { headers: { cookie, 'x-af-staff-read': '1' } }));
      assert.equal(response.status, 401);
    }
    const valid = await h.login('paul');
    assert.equal((await api.GET(new Request('https://afro.test/api/orders?id=private', { headers: { cookie: valid.cookie, 'x-af-staff-read': '1' } }))).status, 200);
  });
}
const native = load('terminal-mobile/payment-state.ts');
const expected = { orderId: 'AF-fixture', paymentIntentId: 'pi_fixture', amountCents: 1200, currency: 'eur' };
const paid = { id: expected.orderId, stripe_payment_intent_id: expected.paymentIntentId, amount_cents: 1200, currency: 'eur', payment: 'card', payment_provider: 'stripe', paid_at: '2026-10-23T12:00:00Z', status: 'NEW' };
for (const status of ['NEW', 'IN_PROGRESS', 'READY', 'DONE']) test(`native accepts verified payment at ${status}`, () => assert.equal(native.isVerifiedNativePayment({ ...paid, status }, expected), true));
for (const change of [{status:'PENDING_PAYMENT'},{status:'CANCELED'},{payment:'cash'},{paid_at:null},{payment_provider:null},{stripe_payment_intent_id:'pi_other'},{amount_cents:1},{currency:'usd'},{id:'other'}]) test(`native rejects inconsistent payment ${JSON.stringify(change)}`, () => assert.equal(native.isVerifiedNativePayment({ ...paid, ...change }, expected), false));
test('native logout waits for revocation and propagates failure', async () => {
  let release, done = false;
  const pending = native.revokeNativeSession(() => new Promise(resolve => { release = resolve; })).then(() => { done = true; });
  await Promise.resolve(); assert.equal(done, false); release({ok:true}); await pending; assert.equal(done, true);
  await assert.rejects(native.revokeNativeSession(async () => ({ok:false})), /Logout not confirmed/);
  await assert.rejects(native.revokeNativeSession(async () => { throw Error('offline'); }), /offline/);
});
const { retryStaffTransaction } = load('src/lib/staff-transaction-retry.ts');
for (const code of ['40P01', '40001']) test(`whole staff transaction retries ${code} at most twice`, async () => {
  let attempts = 0;
  assert.equal(await retryStaffTransaction(async () => { if (++attempts < 3) throw Object.assign(Error('abort'), {code}); return 'committed'; }), 'committed');
  assert.equal(attempts, 3); attempts = 0;
  await assert.rejects(retryStaffTransaction(async () => { attempts++; throw Object.assign(Error('abort'), {code}); })); assert.equal(attempts, 3);
});
test('staff transaction never retries authorization/unique/network errors', async () => {
  for (const code of ['23505', 'P0001', undefined]) { let attempts = 0;
    await assert.rejects(retryStaffTransaction(async () => { attempts++; throw Object.assign(Error('rejected'), {code}); })); assert.equal(attempts, 1);
  }
});

test('public fallback polls at 20s, skips hidden/in-flight checks and cleans up', async () => {
  const { startPublicOrderPolling } = load('src/lib/public-order-polling.ts');
  let callback, cleared, calls = 0, visible = true, release;
  const stop = startPublicOrderPolling(() => { calls++; return new Promise(resolve => { release = resolve; }); }, () => visible,
    { setInterval: (fn, delay) => { assert.equal(delay, 20000); callback = fn; return 7; }, clearInterval: id => { cleared = id; } });
  assert.equal(calls, 0); callback(); callback(); assert.equal(calls, 1);
  release(); await new Promise(resolve => setImmediate(resolve));
  visible = false; callback(); assert.equal(calls, 1);
  visible = true; callback(); assert.equal(calls, 2);
  stop(); assert.equal(cleared, 7); callback(); assert.equal(calls, 2); release();
});

test('manual migration plan covers runtime prerequisites and separates legacy activation', () => {
  const fs = require('node:fs');
  const plan = fs.readFileSync('scripts/prepare_production.sql', 'utf8');
  const names = [...plan.matchAll(/^\\ir (.+)$/gm)].map(match => match[1]);
  assert.deepEqual(names, ['production_preflight.sql', 'prepare_production_prerequisites.sql', 'create_staff_auth_refunds.sql', 'add_staff_workstations.sql', 'add_refund_request_context.sql']);
  const prerequisite = fs.readFileSync('scripts/prepare_production_prerequisites.sql', 'utf8').replace(/\s+/g,' ');
  for (const source of ['src/lib/orders-schema.ts','src/lib/menu-settings.ts','src/lib/terminal-active-orders.ts']) {
    for (const [,sql] of fs.readFileSync(source,'utf8').matchAll(/await sql`([\s\S]*?)`/g)) {
      if (/^(CREATE TABLE|ALTER TABLE|CREATE UNIQUE INDEX)/.test(sql.trim())) assert.ok(prerequisite.includes(sql.trim().replace(/\s+/g,' ')), source);
    }
  }
  const expansion = fs.readFileSync('scripts/add_staff_workstations.sql','utf8');
  assert.doesNotMatch(expansion, /DROP TRIGGER|CREATE TRIGGER/);
  assert.match(expansion, /NEW.event_name NOT LIKE 'v3:%'/);
  const cutover = fs.readFileSync('scripts/enforce_cashier_v3_cutover.sql','utf8');
  assert.match(cutover, /LOCK TABLE cashier_event_locks IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(cutover, /legacy_cashier_leases_active/);
  assert.match(cutover, /CREATE OR REPLACE TRIGGER/);
  for (const name of names) assert.doesNotMatch(fs.readFileSync('scripts/'+name,'utf8'), /\b(?:DROP TABLE|TRUNCATE|UPDATE orders SET quantity_applied)\b/i);
});
