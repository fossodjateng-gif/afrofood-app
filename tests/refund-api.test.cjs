/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');
const { staffHarness } = require('./staff-auth-harness.cjs');
const { refundHarness } = require('./refund-harness.cjs');
process.env.STAFF_AUTH_ORIGIN = 'https://afro.test';
process.env.REFUND_CREATE_ENABLED = '1';
async function setup() {
  const staff = await staffHarness(), refund = refundHarness();
  const sql = (strings, ...v) => /staff_/.test(strings.join('')) ? staff.mocks['@/lib/db'].sql(strings, ...v) : refund.sql(strings, ...v);
  const api = load('src/app/api/orders/[id]/refund/route.ts', { ...refund.mocks, '@/lib/db': { sql } });
  const request = async (method, cookie = '', body = {}, headers = {}) => {
    const req = new Request('https://afro.test/api/orders/ORDER-X/refund', { method, headers: { origin: 'https://afro.test', cookie, ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
    return api[method](req, { params: Promise.resolve({ id: 'ORDER-X' }) });
  };
  return { staff, refund, request };
}
test('Refund route cannot be authorized by forged headers/body, only the common staff cookie', async () => {
  const h = await setup();
  const forged = await h.request('POST', '', { requested_by: 'admin', userId: 'admin' }, { 'x-staff-role': 'admin' });
  assert.equal(forged.status, 401);assert.equal(h.refund.calls.length, 0);
  const kitchen = await h.staff.login('kitchen');assert.equal((await h.request('POST', kitchen.cookie)).status, 403);
  const paul = await h.staff.login('paul');
  assert.equal((await h.request('POST', paul.cookie, {}, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await h.request('POST', paul.cookie, {}, { 'x-staff-user-id': 'marie' })).status, 409);
  const response = await h.request('POST', paul.cookie, { requested_by: 'marie', amount_cents: 1, role: 'admin' });
  assert.equal(response.status, 200);const data = await response.json();assert.equal(data.refund.state, 'refunded');
  assert.equal(h.refund.rows.get('ORDER-X').requested_by, 'paul');
  assert.doesNotMatch(JSON.stringify(data), /pi_fixture|re_fixture|refund_key|requested_by|scrypt/);
});
test('Admin and Kasse use the same authentication; session role and event changes take effect immediately', async () => {
  const h = await setup(), admin = await h.staff.login('admin');
  assert.equal((await h.request('POST', admin.cookie)).status, 200);
  assert.equal(h.refund.rows.get('ORDER-X').requested_by, 'admin');
  h.staff.users.get('admin').role = 'kitchen';assert.equal((await h.request('POST', admin.cookie)).status, 403);
  const marie = await h.staff.login('marie');h.staff.users.get('marie').cashier_event_id = 'other';
  assert.equal((await h.request('POST', marie.cookie)).status, 403);
});
test('GET is authenticated and cannot create; unexpected Stripe/DB errors expose no technical information', async () => {
  const h = await setup(), paul = await h.staff.login('paul');
  assert.equal((await h.request('GET', paul.cookie)).status, 200);assert.equal(h.refund.rows.size, 0);
  h.refund.failSave = true;
  const response = await h.request('POST', paul.cookie);assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: 'refund_unavailable' });
  assert.equal((await h.request('GET', paul.cookie)).status, 200);assert.equal(h.refund.keys.size, 1);
});
