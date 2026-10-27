/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./ui-harness.cjs');
const contextId = 'a'.repeat(64), replacedId = 'b'.repeat(64);
const instanceId = '11111111-1111-4111-8111-111111111111';
const stationId = '22222222-2222-4222-8222-222222222222';
class StaffAuthError extends Error { constructor(code, status = 401) { super(code); this.code = code; this.status = status; } }
function fixture() {
  const now = Date.now();
  const state = {
    actor: { id: 'real-admin', username: 'anaclet', role: 'admin', active: true, cashierEventId: 'permanent', workstationId: 'permanent-station', workstationType: 'cashier', workstationName: 'Permanent' },
    row: { cashier_context_id: contextId, cashier_context_event_id: 'testmaison', cashier_context_workstation_id: stationId, cashier_context_instance_id: instanceId,
      cashier_context_created_at: new Date(now - 1000), cashier_context_expires_at: new Date(now + 60000), session_expires_at: new Date(now + 120000) },
    events: [{ id: 'testmaison' }], config: { cashier: [{ id: stationId, name: 'Caisse TestMaison', type: 'cashier', active: true }], kitchen: [] },
    permanentCalls: 0, sessionCalls: 0, queries: [], sessionError: null,
  };
  const sql = async (strings, ...values) => {
    const query = strings.join('?'); state.queries.push({ query, values });
    assert.match(query.trim(), /^SELECT\b/, 'Resolver must never write or ensure schemas');
    if (query.includes('FROM staff_sessions')) {
      assert.match(query, /s\.revoked_at IS NULL/);
      assert.match(query, /u\.active = TRUE AND u\.role = 'admin'/);
      assert.match(query, /s\.expires_at > clock_timestamp\(\)/);
      assert.ok(values.includes('server-session-hash'));
      assert.ok(values.includes(state.actor.id));
      return state.row ? [state.row] : [];
    }
    if (query.includes('FROM app_settings')) return [{ setting_value: { events: state.events } }];
    throw Error('Unexpected query');
  };
  const api = load('src/lib/cashier-operational-context.ts', {
    '@/lib/db': { sql },
    '@/lib/staff-session-server': { StaffAuthError, staffSessionHash: () => 'server-session-hash',
      requireStaffSession: async () => { state.sessionCalls++; if (state.sessionError) throw state.sessionError; return state.actor; },
      requireAssignedCashRegister: async () => { state.permanentCalls++; if (state.sessionError) throw state.sessionError; return state.actor; },
    },
    '@/lib/workstations-server': { getWorkstations: async eventId => { assert.equal(eventId, 'testmaison'); return state.config; } },
  });
  const request = (headers = {}) => new Request('http://localhost/caisse', { headers: { 'x-cashier-context-id': contextId, 'x-cashier-instance-id': instanceId, ...headers } });
  return { state, api, request };
}
const rejects = async (f, req = f.request(), requested) => {
  await assert.rejects(f.api.resolveCashierOperationalContext(req, requested), StaffAuthError);
  assert.equal(f.state.permanentCalls, 0, 'Explicit temporary context must never fall back');
};

test('permanent cashier/admin assignments still resolve through the existing guard', async () => {
  for (const role of ['cashier', 'admin']) {
    const f = fixture(); f.state.actor.role = role;
    const result = await f.api.resolveCashierOperationalContext(new Request('http://localhost/caisse', { headers: { 'x-cashier-instance-id': instanceId } }), { eventId: 'permanent', workstationId: 'permanent-station' });
    assert.equal(result.actor.role, role); assert.equal(result.eventId, 'permanent'); assert.equal(result.contextId, null);
    assert.equal(result.instanceId, instanceId); assert.equal(f.state.permanentCalls, 1); assert.equal(f.state.queries.length, 0);
  }
});
test('temporary context preserves real Admin identity and permanent assignment separately', async () => {
  const f = fixture(), before = structuredClone(f.state.actor);
  const result = await f.api.resolveCashierOperationalContext(f.request(), { eventId: 'testmaison', workstationId: stationId });
  assert.equal(result.actor.id, 'real-admin'); assert.equal(result.actor.username, 'anaclet'); assert.equal(result.actor.role, 'admin');
  assert.equal(result.eventId, result.workstation.eventId); assert.equal(result.workstation.id, stationId);
  assert.equal(result.contextId, contextId); assert.equal(result.instanceId, instanceId);
  assert.deepEqual(f.state.actor, before); assert.equal(result.actor.cashierEventId, 'permanent'); assert.equal(f.state.permanentCalls, 0);
});
test('non-Admin, inactive account and invalid session cannot resolve temporary context', async () => {
  for (const change of ['cashier', 'kitchen', 'inactive', 'session']) {
    const f = fixture();
    if (change === 'inactive') f.state.actor.active = false;
    else if (change === 'session') f.state.sessionError = new StaffAuthError('session_required');
    else f.state.actor.role = change;
    await rejects(f);
  }
});
test('expired, overlong, future-created and incomplete contexts fail without fallback', async () => {
  for (const change of ['expired', 'overlong', 'future', 'incomplete']) {
    const f = fixture();
    if (change === 'expired') f.state.row.cashier_context_expires_at = new Date(Date.now() - 100);
    if (change === 'overlong') f.state.row.cashier_context_expires_at = new Date(Date.now() + 240000);
    if (change === 'future') f.state.row.cashier_context_created_at = new Date(Date.now() + 30000);
    if (change === 'incomplete') f.state.row.cashier_context_created_at = null;
    await rejects(f);
  }
});
test('wrong, empty, replaced and cleared context IDs fail despite a valid permanent assignment', async () => {
  for (const change of ['wrong', 'empty', 'replaced', 'cleared']) {
    const f = fixture();
    if (change === 'replaced') f.state.row.cashier_context_id = replacedId;
    if (change === 'cleared') f.state.row = null;
    await rejects(f, f.request({ 'x-cashier-context-id': change === 'wrong' ? replacedId : change === 'empty' ? '' : contextId }));
  }
});
test('missing or different V3 instance cannot reuse the temporary context', async () => {
  for (const instance of ['', '33333333-3333-4333-8333-333333333333']) {
    const f = fixture(); await rejects(f, f.request({ 'x-cashier-instance-id': instance }));
  }
});
test('forged requested event fails for temporary AND permanent contexts', async () => {
  const f = fixture(); await rejects(f, f.request(), { eventId: 'forged' });
  await assert.rejects(f.api.resolveCashierOperationalContext(new Request('http://localhost/caisse'), { eventId: 'forged' }), /cashier_event_context_mismatch/);
});
test('removed event and station belonging only to another event are refused', async () => {
  for (const change of ['event', 'station']) {
    const f = fixture();
    if (change === 'event') f.state.events = [];
    else f.state.config.cashier = [];
    await rejects(f);
  }
});
test('non-cashier and inactive workstations are refused', async () => {
  for (const change of ['kitchen', 'inactive']) {
    const f = fixture();
    if (change === 'kitchen') { f.state.config.cashier[0].type = 'kitchen'; }
    else f.state.config.cashier[0].active = false;
    await rejects(f);
  }
});
test('body/header workstation mismatch and inconsistent resolved station event are refused', async () => {
  const f = fixture(); await rejects(f, f.request(), { workstationId: 'other-station' });
  await rejects(f, f.request({ 'x-workstation-id': 'other-station' }));
  const context = await f.api.resolveCashierOperationalContext(f.request());
  context.workstation.eventId = 'other-event';
  assert.throws(() => f.api.assertCashierContextMatches(context), /cashier_event_context_mismatch/);
});
test('lifetime preparation caps expiry to the session and rejects invalid/expired dates', () => {
  const f = fixture(), now = new Date('2026-10-27T10:00:00Z'), session = new Date('2026-10-27T10:30:00Z');
  const capped = f.api.prepareCashierContextLifetime(session, new Date('2026-10-27T12:00:00Z'), now);
  assert.deepEqual(capped, { createdAt: now, expiresAt: session });
  const short = new Date('2026-10-27T10:05:00Z');
  assert.equal(f.api.prepareCashierContextLifetime(session, short, now).expiresAt.getTime(), short.getTime());
  for (const [s, requested] of [[now, short], [session, now], [new Date('invalid'), short], [session, new Date('invalid')]]) {
    assert.throws(() => f.api.prepareCashierContextLifetime(s, requested, now), /invalid_cashier_context_lifetime/);
  }
});
