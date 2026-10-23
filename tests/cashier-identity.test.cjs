/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');
const { staffHarness } = require('./staff-auth-harness.cjs');
process.env.STAFF_AUTH_ORIGIN = 'https://afro.test';
test('POS cash/card creation uses authenticated actor, never browser userId/username/role', async () => {
  const h = await staffHarness(), created = [];
  const api = load('src/app/api/orders/route.ts', {
    ...h.mocks,
    "@/lib/menu-settings": { getStoreConfig: async () => ({ events: [{ id: "event-x", name: "Event X" }] }) },
    '@/lib/orders-schema': { ensureOrdersSchema: async () => {} },
    '@/lib/pos-cash-server': { createPosCashOrder: async input => { created.push(input);return Response.json({ ok: true }); } },
    '@/lib/pos-card-server': { createPosCardOrder: async input => { created.push(input);return Response.json({ ok: true }); } },
  });
  for (const name of ['paul', 'marie']) {
    const { cookie } = await h.login(name);
    for (const payment of ['cash', 'card']) {
      const body = { eventId: 'event-x', payment, items: [{ id: 'meal', qty: 1 }], userId: 'forged', username: 'forged', role: 'admin',
        ...(payment === 'cash' ? { posCashKey: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } : { posCardKey: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', fingerprint: 'a'.repeat(64) }) };
      const req = new Request('https://afro.test/api/orders', { method: 'POST', headers: { cookie, origin: 'https://afro.test', 'x-staff-role': 'admin', 'x-cashier-instance-id': '11111111-1111-4111-8111-111111111111' }, body: JSON.stringify(body) });
      assert.equal((await api.POST(req)).status, 200);
      const input = created.at(-1);assert.equal(payment === 'cash' ? input.actor.id : input.userId, name);
      assert.equal(payment === 'cash' ? input.actor.username : input.username, name);
    }
  }
  assert.deepEqual(h.audits.map(row => row.actor), ['paul', 'paul', 'marie', 'marie']);
});
test('POS creation without a cookie never reaches sale code, even with privileged headers', async () => {
  const h = await staffHarness();let called = false;
  const api = load('src/app/api/orders/route.ts', { ...h.mocks, '@/lib/orders-schema': { ensureOrdersSchema: async () => {} }, '@/lib/pos-cash-server': { createPosCashOrder: async () => { called = true;throw Error('forbidden'); } } });
  const response = await api.POST(new Request('https://afro.test/api/orders', { method: 'POST', headers: { origin: 'https://afro.test', 'x-staff-role': 'admin', 'x-cashier-instance-id': '11111111-1111-4111-8111-111111111111' }, body: JSON.stringify({ eventId: 'event-x', payment: 'cash', posCashKey: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', items: [{ id: 'meal', qty: 1 }] }) }));
  assert.equal(response.status, 401);assert.equal(called, false);
});
