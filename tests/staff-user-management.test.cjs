/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { load, harness, findAll } = require('./ui-harness.cjs');

test('staff management: real SQL, password login, revocation, self protection and historical preservation', async t => {
  assert.ok(process.env.AFROFOOD_PGLITE_MODULE);
  const { PGlite } = require(process.env.AFROFOOD_PGLITE_MODULE), db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE staff_users (id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, role TEXT, active BOOLEAN,
    cashier_event_id TEXT, workstation_id TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE staff_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES staff_users(id), revoked_at TIMESTAMPTZ, expires_at TIMESTAMPTZ);
    CREATE TABLE cashier_event_locks (event_name TEXT, user_id TEXT);
    CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value JSONB, updated_at TIMESTAMPTZ);
    CREATE TABLE staff_login_limits (bucket TEXT, window_start TIMESTAMPTZ, attempts INTEGER, PRIMARY KEY (bucket, window_start));
    CREATE TABLE orders (id TEXT PRIMARY KEY, created_by TEXT REFERENCES staff_users(id), created_by_username TEXT, event_id TEXT,
      register_id TEXT, register_name TEXT, paid_by TEXT REFERENCES staff_users(id), paid_by_username TEXT, paid_register_id TEXT, paid_register_name TEXT);
    INSERT INTO app_settings VALUES ('store_config', '{"events":[{"id":"a","name":"Festival A"},{"id":"b","name":"Festival B"}]}', NOW());`);
  const guardSource = readFileSync('scripts/add_staff_workstations.sql', 'utf8');
  await db.exec(guardSource.slice(guardSource.indexOf('CREATE OR REPLACE FUNCTION af_assert_staff_admin'), guardSource.indexOf('CREATE OR REPLACE FUNCTION af_assert_staff_assignment')));
  const queries = [];
  function compile(query, values = []) {
    let text = '';
    query.strings.forEach((part, i) => {
      text += part;
      if (i < query.values.length) {
        const value = query.values[i];
        if (value?.strings) text += compile(value, values).text;
        else { values.push(value); text += `$${values.length}`; }
      }
    });
    return { text, values };
  }
  async function execute(query) { const q = compile(query); queries.push(q.text); return (await db.query(q.text, q.values)).rows; }
  const sql = (strings, ...values) => ({ strings, values, then(resolve, reject) { return execute(this).then(resolve, reject); } });
  sql.transaction = async statements => {
    await db.exec('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try { const results = []; for (const q of statements) results.push(await execute(q)); await db.exec('COMMIT'); return results; }
    catch (e) { await db.exec('ROLLBACK'); throw e; }
  };
  const mocks = { '@/lib/db': { sql }, '@/lib/menu-settings': { getStoreConfig: async () => ({ events: [{ id: 'a' }, { id: 'b' }] }) },
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } } };
  const cache = new Map(), auth = load('src/lib/staff-session-server.ts', mocks, cache);
  const passwords = load('src/lib/staff-password.ts', mocks, cache);
  const oldPassword = 'fixture-old-password', newPassword = 'fixture-new-password';
  for (const [id, role] of [['admin', 'admin'], ['papa', 'cashier'], ['kitchen', 'kitchen']]) {
    await db.query('INSERT INTO staff_users (id,username,password_hash,role,active,cashier_event_id) VALUES ($1,$1,$2,$3,TRUE,$4)', [id, await passwords.hashStaffPassword(oldPassword), role, role === 'admin' ? null : 'a']);
  }
  const tokens = { admin: 'a'.repeat(64), papa: 'b'.repeat(64), kitchen: 'c'.repeat(64) };
  for (const [id, token] of Object.entries(tokens)) await db.query("INSERT INTO staff_sessions VALUES ($1,$2,NULL,NOW()+interval '2 hours')", [auth.tokenHash(token), id]);
  const request = (path, body, user = 'admin', origin = 'https://fixture.test') => new Request(`https://fixture.test${path}`, {
    method: body ? 'POST' : 'GET', headers: { origin, cookie: user ? `af_staff_session=${tokens[user]}` : '' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const usersApi = load('src/app/api/staff/users/route.ts', mocks, cache), passwordApi = load('src/app/api/staff/users/password/route.ts', mocks, cache);
  const loginApi = load('src/app/api/staff/session/route.ts', mocks, cache), adminServer = load('src/lib/staff-admin-server.ts', mocks, cache);
  const statsApi = load('src/app/api/stats/route.ts', mocks, cache);
  for (const user of ['papa', 'kitchen', '']) assert.ok([401, 403].includes((await statsApi.GET(request('/api/stats?catalog=1', undefined, user))).status));
  const catalog = await statsApi.GET(request('/api/stats?catalog=1'));
  assert.equal(catalog.status, 200); assert.deepEqual((await catalog.json()).events.map(event => event.id), ['a', 'b']);
  assert.equal((await statsApi.GET(request('/api/stats?eventId=unknown'))).status, 400);
  const change = (body, user, origin) => passwordApi.POST(request('/api/staff/users/password', body, user, origin));
  const credentials = { id: 'papa', password: newPassword, confirmation: newPassword };
  for (const user of ['papa', 'kitchen', '']) assert.ok([401, 403].includes((await change(credentials, user)).status));
  assert.equal((await change(credentials, 'admin', 'https://foreign.test')).status, 403);
  for (const body of [{ ...credentials, confirmation: 'different' }, { ...credentials, password: 'short', confirmation: 'short' }]) assert.equal((await change(body)).status, 400);
  // Existing create/edit functions drive automatic ownership and role/event reuse unchanged.
  await adminServer.saveStaff(request('/api/staff/users', {}), { id: 'papa', role: 'cashier', active: true, eventId: 'a' }, false);
  const first = (await db.query("SELECT * FROM staff_users WHERE id='papa'")).rows[0];
  await db.query("INSERT INTO orders VALUES ('sale','papa','papa','a',$1,'Caisse papa','papa','papa',$1,'Caisse papa')", [first.workstation_id]);
  const history = (await db.query('SELECT * FROM orders')).rows;
  const settingsBeforePassword = (await db.query('SELECT * FROM app_settings ORDER BY setting_key')).rows;
  const changed = await change(credentials); assert.equal(changed.status, 200); assert.deepEqual(await changed.json(), { ok: true });
  const current = (await db.query("SELECT password_hash FROM staff_users WHERE id='papa'")).rows[0].password_hash;
  assert.match(current, /^scrypt-v1:/); assert.notEqual(current, newPassword);
  assert.equal(await passwords.verifyStaffPassword(oldPassword, current), false);
  assert.equal(await passwords.verifyStaffPassword(newPassword, current), true);
  assert.equal((await db.query("SELECT revoked_at FROM staff_sessions WHERE user_id='papa'")).rows.every(row => !!row.revoked_at), true);
  assert.deepEqual((await db.query('SELECT * FROM app_settings ORDER BY setting_key')).rows, settingsBeforePassword);
  const login = password => loginApi.POST(request('/api/staff/session', { username: 'papa', password }, ''));
  assert.equal((await login(oldPassword)).status, 401);
  const success = await login(newPassword); assert.equal(success.status, 200);
  assert.doesNotMatch(JSON.stringify(await success.json()), /password|scrypt|hash/);
  const userCookie = success.headers.get('set-cookie').split(';')[0];
  const assertAccessDenied = async () => assert.rejects(auth.requireStaffSession(new Request('https://fixture.test', { headers: { cookie: userCookie } })));
  for (const [role, eventId] of [['kitchen', 'a'], ['cashier', 'b'], ['cashier', 'a']]) await adminServer.saveStaff(request('/api/staff/users', {}), { id: 'papa', role, active: true, eventId }, false);
  assert.equal((await db.query("SELECT workstation_id FROM staff_users WHERE id='papa'")).rows[0].workstation_id, first.workstation_id);
  await assertAccessDenied();
  await adminServer.saveStaff(request('/api/staff/users', {}), { id: 'papa', role: 'cashier', active: false, eventId: 'a' }, false);
  assert.equal((await login(newPassword)).status, 401); await assertAccessDenied();
  assert.deepEqual((await db.query('SELECT * FROM orders')).rows, history);
  assert.equal((await db.query("SELECT setting_value FROM app_settings WHERE setting_key='workstations:a'")).rows[0].setting_value.cashier[0].id, first.workstation_id);
  for (const body of [{ id: 'admin', role: 'admin', active: false }, { id: 'admin', role: 'cashier', active: true, eventId: 'a' }]) {
    await assert.rejects(adminServer.saveStaff(request('/api/staff/users', {}), body, false), /cannot_disable_current_admin/);
  }
  const listed = await (await usersApi.GET(request('/api/staff/users'))).json();
  assert.doesNotMatch(JSON.stringify(listed), /password|scrypt|hash/);
  assert.equal(usersApi.DELETE, undefined); assert.ok(queries.every(q => !/DELETE FROM staff_users|UPDATE orders|DELETE FROM orders/.test(q)));
});

test('password form confirms, clears secrets after success, and self Admin editing is guarded in the UI', async t => {
  const oldWindow = global.window; global.window = { confirm: () => false, location: { href: '' } }; t.after(() => { global.window = oldWindow; });
  const users = [{ id: 'admin', username: 'admin', role: 'admin', active: true }], calls = [];
  const h = harness('src/app/staff/admin/users/page.tsx', { lang: 'fr', loading: false, adminEventId: 'a', events: [{ id: 'a', name: 'A' }], users,
    draft: { mode: 'edit', id: 'admin', username: 'admin', role: 'admin', active: true, eventId: '' } }, {
    '@/lib/staff-auth': { getSession: () => ({ userId: 'admin', role: 'admin' }), getStaffRoleLabel: role => role, staffFetch: async (url, init) => { calls.push([url, init]); return Response.json({ ok: true }); } },
  });
  let tree = h.render();
  assert.ok(findAll(tree, n => n.type === 'select')[0].props.disabled);
  assert.ok(findAll(tree, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.disabled);
  findAll(tree, n => n.type === 'button' && n.props.children === 'Changer le mot de passe')[0].props.onClick(); tree = h.render();
  const passwords = findAll(tree, n => n.type === 'input' && n.props.type === 'password'); assert.equal(passwords.length, 2);
  passwords[0].props.onChange({ target: { value: 'new-fixture-password' } }); passwords[1].props.onChange({ target: { value: 'different' } }); tree = h.render();
  await findAll(tree, n => n.type === 'form')[1].props.onSubmit({ preventDefault() {} }); assert.equal(calls.length, 0);
  findAll(tree, n => n.type === 'input' && n.props.type === 'password')[1].props.onChange({ target: { value: 'new-fixture-password' } }); tree = h.render();
  await findAll(tree, n => n.type === 'form')[1].props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1); assert.equal(h.state.newPassword, ''); assert.equal(h.state.passwordConfirmation, ''); assert.equal(h.state.passwordTarget, null);
  assert.equal(window.location.href, '/team/login');
});

test('deactivation requires explicit confirmation and sends no mutation if cancelled', async t => {
  const oldWindow = global.window; let confirmations = 0, calls = 0;
  global.window = { confirm: () => { confirmations++; return false; } }; t.after(() => { global.window = oldWindow; });
  const h = harness('src/app/staff/admin/users/page.tsx', { lang: 'fr', loading: false, adminEventId: 'a', events: [{ id: 'a', name: 'A' }],
    users: [{ id: 'papa', username: 'papa', active: true, role: 'cashier', cashier_event_id: 'a' }],
    draft: { mode: 'edit', id: 'papa', username: 'papa', role: 'cashier', active: false, eventId: 'a' } }, {
    '@/lib/staff-auth': { getSession: () => ({ userId: 'admin', role: 'admin' }), getStaffRoleLabel: role => role, staffFetch: async () => { calls++; throw Error('must not mutate'); } },
  });
  await findAll(h.render(), n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.equal(confirmations, 1); assert.equal(calls, 0);
});
