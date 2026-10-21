/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs');
const { load } = require('./ui-harness.cjs');
const { staffHarness } = require('./staff-auth-harness.cjs');
process.env.STAFF_AUTH_ORIGIN = 'https://afro.test';

test('credentials are salted scrypt hashes; incorrect or malformed hashes fail', async () => {
  const passwords = load('src/lib/staff-password.ts');
  const first = await passwords.hashStaffPassword('fixture-only-password');
  const second = await passwords.hashStaffPassword('fixture-only-password');
  assert.notEqual(first, second);assert.equal(await passwords.verifyStaffPassword('fixture-only-password', first), true);
  assert.equal(await passwords.verifyStaffPassword('wrong', first), false);
  assert.equal(await passwords.verifyStaffPassword('fixture-only-password', 'broken'), false);
  await assert.rejects(passwords.hashStaffPassword('short'));
});

for (const name of ['paul', 'marie', 'admin', 'kitchen']) {
  test(`server login ${name}: opaque HttpOnly cookie, no token/hash/password in JSON`, async () => {
    const h = await staffHarness(), { response, cookie } = await h.login(name);
    assert.equal(response.status, 200);
    const body = await response.json(), rawCookie = response.headers.get('set-cookie');
    assert.equal(body.user.id, name);assert.doesNotMatch(JSON.stringify(body), /password|token|scrypt/);
    assert.match(rawCookie, /HttpOnly/);assert.match(rawCookie, /Secure/);assert.match(rawCookie, /SameSite=Strict/);assert.match(rawCookie, /Max-Age=7200/);
    assert.doesNotMatch(rawCookie, /Domain=/);
    assert.ok(!h.sessions.has(cookie.split('=')[1]));
    const user = await h.session.requireStaffSession(h.req('GET', cookie));assert.equal(user.id, name);
    if (name === 'kitchen') await assert.rejects(h.session.requireCashRegisterPermission(h.req('POST', cookie), 'event-x'), /forbidden/);
    else assert.equal((await h.session.requireCashRegisterPermission(h.req('POST', cookie), 'event-x')).id, name);
  });
}

for (const condition of ['absent', 'invented', 'expired', 'revoked', 'disabled', 'unknown-role']) {
  test(`sensitive permission rejects ${condition} session`, async () => {
    const h = await staffHarness();let { cookie } = await h.login('paul');
    if (condition === 'absent') cookie = '';
    if (condition === 'invented') cookie = 'af_staff_session=' + 'f'.repeat(64);
    if (condition === 'expired') [...h.sessions.values()][0].expires_at = 0;
    if (condition === 'revoked') [...h.sessions.values()][0].revoked_at = 1;
    if (condition === 'disabled') h.users.get('paul').active = false;
    if (condition === 'unknown-role') h.users.get('paul').role = 'unknown';
    await assert.rejects(h.session.requireCashRegisterPermission(h.req('POST', cookie, {}, { 'x-staff-role': 'admin', 'x-staff-user-id': 'admin' }), 'event-x'));
  });
}

test('headers, posted username and localStorage cannot grant a session; event scope comes from DB', async () => {
  const h = await staffHarness();
  await assert.rejects(h.session.requireCashRegisterPermission(h.req('POST', '', { username: 'admin', userId: 'admin' }, { 'x-staff-role': 'admin' }), 'event-x'));
  const { cookie } = await h.login('paul');
  const actor = await h.action.cashRegisterActor(h.req('POST', cookie, { userId: 'marie', username: 'marie' }, { 'x-staff-role': 'admin' }), 'event-x');
  assert.equal(actor.id, 'paul');assert.equal(actor.role, 'cashier');
  await assert.rejects(h.action.cashRegisterActor(h.req('POST', cookie, {}, { 'x-staff-user-id': 'marie' }), 'event-x'), /cashier_changed/);
  await assert.rejects(h.session.requireCashRegisterPermission(h.req('POST', cookie), 'event-other'));
  h.users.get('paul').cashier_event_id = 'event-other';
  await assert.rejects(h.session.requireCashRegisterPermission(h.req('POST', cookie), 'event-x'));
  assert.equal((await h.session.requireCashRegisterPermission(h.req('POST', cookie), 'event-other')).id, 'paul');
  const source = fs.readFileSync('src/lib/staff-session-server.ts', 'utf8');assert.doesNotMatch(source, /localStorage|sessionStorage|x-staff-role/);
});

test('Paul and Marie same event remain distinct; logout and cashier replacement revoke the old identity', async () => {
  const h = await staffHarness(), paul = await h.login('paul'), marie = await h.login('marie');
  for (const [cookie, action] of [[paul.cookie, 'sale'], [marie.cookie, 'refund']]) {
    const actor = await h.action.cashRegisterActor(h.req('POST', cookie), 'event-x');
    await h.action.recordCashRegisterRequest(actor.id, action, 'event-x', 'order-x');
  }
  assert.deepEqual(h.audits.map(row => row.actor), ['paul', 'marie']);
  assert.equal((await h.api.DELETE(h.req('DELETE', paul.cookie))).status, 200);
  await assert.rejects(h.session.requireStaffSession(h.req('GET', paul.cookie)));
  const replacement = await h.login('paul', marie.cookie);
  await assert.rejects(h.session.requireStaffSession(h.req('GET', marie.cookie)));
  assert.equal((await h.session.requireStaffSession(h.req('GET', replacement.cookie))).id, 'paul');
});

test('CSRF/origin fail closed; durable account and global login limits apply', async () => {
  const h = await staffHarness();
  assert.equal((await h.api.POST(h.req('POST', '', { username: 'paul', password: 'fixture-only-paul-password' }, { origin: 'https://evil.test' }))).status, 403);
  assert.equal((await h.api.DELETE(h.req('DELETE', '', undefined, { 'sec-fetch-site': 'cross-site' }))).status, 403);
  for (let i = 0; i < 8; i++) assert.equal((await h.api.POST(h.req('POST', '', { username: 'paul', password: 'wrong-password' }))).status, 401);
  assert.equal((await h.login('paul')).response.status, 429);
  h.limits.set('global', 120);assert.equal((await h.login('marie')).response.status, 429);
});

test('invalid rate-limit DB result fails closed', async () => {
  const session = load('src/lib/staff-session-server.ts', { '@/lib/db': { sql: async () => [] } });
  assert.equal(await session.allowStaffLogin('fixture-user'), false);
});
