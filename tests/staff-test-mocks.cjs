// Explicit authenticated fixtures for pre-existing payment regression tests.
// Security tests load the real session module, never these fixtures.
class StaffAuthError extends Error {
  constructor(code, status = 401) { super(code); this.code = code; this.status = status; }
}
async function actor(req, eventId) {
  const body = req.testActor || (req.bodyUsed ? {} : await req.clone().json().catch(() => ({})));
  const role = req.headers.get('x-staff-role') || 'admin';
  if (!['admin', 'cashier'].includes(role)) throw new StaffAuthError('forbidden', 403);
  return { id: body.userId || req.headers.get('x-staff-user-id') || 'user-a', username: body.username || 'kasse', role, active: true, cashierEventId: eventId || body.eventId || 'event-a', workstationId: '11111111-1111-4111-8111-111111111111', workstationName: 'Caisse 1', workstationType: 'cashier' };
}
const legacyStaffMocks = {
  '@/lib/cashier-write-context': {
    requireCashierWrite: async (req, eventId) => { const u = await actor(req, eventId); return { userId: u.id, username: u.username, eventId: u.cashierEventId, workstationId: u.workstationId, workstationName: u.workstationName, sessionHash: 'fixture-session', instanceId: '11111111-1111-4111-8111-111111111111' }; },
    reserveCardCashier: async () => {},
  },
  '@/lib/staff-session-server': { StaffAuthError, staffSessionHash: () => 'fixture-session', requireStaffOrigin: () => {}, requireCashRegisterPermission: actor, requireAssignedCashRegister: actor, requireStaffWorkstation: req => actor(req), requireStaffSession: req => actor(req) },
  '@/lib/staff-action-server': { cashRegisterActor: actor, recordCashRegisterRequest: async () => {} },
};
module.exports = { legacyStaffMocks };
