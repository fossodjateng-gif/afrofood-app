// Explicit authenticated fixtures for pre-existing payment regression tests.
// Security tests load the real session module, never these fixtures.
class StaffAuthError extends Error {
  constructor(code, status = 401) { super(code); this.code = code; this.status = status; }
}
async function actor(req, eventId) {
  const body = req.testActor || (req.bodyUsed ? {} : await req.clone().json().catch(() => ({})));
  const role = req.headers.get('x-staff-role') || 'admin';
  if (!['admin', 'cashier'].includes(role)) throw new StaffAuthError('forbidden', 403);
  return { id: body.userId || req.headers.get('x-staff-user-id') || 'user-a', username: body.username || 'kasse', role, active: true, cashierEventId: eventId || null };
}
const legacyStaffMocks = {
  '@/lib/staff-session-server': { StaffAuthError, requireStaffOrigin: () => {}, requireCashRegisterPermission: actor, requireStaffSession: req => actor(req) },
  '@/lib/staff-action-server': { cashRegisterActor: actor, recordCashRegisterRequest: async () => {} },
};
module.exports = { legacyStaffMocks };
