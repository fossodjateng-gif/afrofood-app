/* eslint-disable @typescript-eslint/no-require-imports */
const { load } = require('./ui-harness.cjs');
const password = load('src/lib/staff-password.ts');
let prepared;
async function staffHarness() {
  prepared ||= Promise.all(['paul', 'marie', 'admin', 'kitchen'].map(async username => ({
    id: username, username, password_hash: await password.hashStaffPassword(`fixture-only-${username}-password`),
    role: username === 'admin' ? 'admin' : username === 'kitchen' ? 'kitchen' : 'cashier', active: true, cashier_event_id: 'event-x',
  })));
  const users = new Map((await prepared).map(user => [user.id, { ...user }]));
  const sessions = new Map(), limits = new Map(), audits = [];
  const sql = async (strings, ...v) => {
    const q = strings.join('');
    if (q.includes('INSERT INTO staff_login_limits')) { const count = (limits.get(v[0]) || 0) + 1;limits.set(v[0], count);return [{ attempts: count }]; }
    if (q.includes('WHERE username =')) return [...users.values()].filter(user => user.username === v[0]);
    if (q.includes('INSERT INTO staff_sessions')) { sessions.set(v[0], { user_id: v[1], expires_at: Date.now() + 7200000, revoked_at: null });return []; }
    if (q.includes('UPDATE staff_sessions')) { const row = sessions.get(v[0]);if (row) row.revoked_at = Date.now();return []; }
    if (q.includes('DELETE FROM cashier_event_locks')) return [];
    if (q.includes('FROM staff_sessions s JOIN')) {
      const session = sessions.get(v[0]), user = users.get(session?.user_id);
      return session && !session.revoked_at && session.expires_at > Date.now() && user?.active ? [{ ...user }] : [];
    }
    if (q.includes('INSERT INTO staff_action_audit')) { audits.push({ actor: v[0], action: v[1], event: v[2], order: v[3] });return []; }
    throw Error('Unmocked authentication SQL: ' + q);
  };
  const mocks = { '@/lib/db': { sql }, 'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } } };
  const cache = new Map();
  const session = load('src/lib/staff-session-server.ts', mocks, cache);
  const api = load('src/app/api/staff/session/route.ts', mocks, cache);
  const action = load('src/lib/staff-action-server.ts', mocks, cache);
  const req = (method = 'GET', cookie = '', body, headers = {}) => new Request('https://afro.test/api/staff/session', {
    method, headers: { origin: 'https://afro.test', cookie, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const login = async (name, cookie = '') => {
    const response = await api.POST(req('POST', cookie, { username: name, password: `fixture-only-${name}-password` }));
    return { response, cookie: (response.headers.get('set-cookie') || '').split(';')[0] };
  };
  return { users, sessions, limits, audits, mocks, cache, session, api, action, req, login };
}
module.exports = { staffHarness };
