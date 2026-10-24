/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, findAll, load } = require('./ui-harness.cjs');
const text = tree => tree == null || typeof tree === 'boolean' ? '' : Array.isArray(tree) ? tree.map(text).join(' ') : typeof tree === 'object' ? text(tree.props?.children) : String(tree);
const settle = () => new Promise(resolve => setImmediate(resolve));

for (const lang of ['de', 'fr', 'en']) test(`staff access ${lang}: branded loading/errors and no raw technical codes`, () => {
  for (const kind of ['session', 'cashier']) {
    for (const error of [null, 'workstation_assignment_required', 'workstation_assignment_invalid', 'Caisse: cashier_lock_lost', 'session_unavailable', 'private diagnostic']) {
      const h = harness('src/components/StaffAccessState.tsx', { lang }, { '@/lib/translations': { getSavedLang: () => lang } });
      const tree = h.render(h.component.StaffAccessState, { kind, error });
      assert.equal(tree.type.name, 'StaffPageFrame');
      assert.match(tree.props.title, /AfroFood/);
      assert.equal(findAll(tree, node => node.props?.role === (error ? 'alert' : 'status')).length, 1);
      assert.equal(findAll(tree, node => node.type === 'a' && node.props.href === '/team/login').length, error ? 1 : 0);
      if (error) assert.ok(!text(tree).includes(error));
    }
  }
});

test('access screen restores the saved language after hydration and survives unavailable storage', async () => {
  for (const unavailable of [false, true]) {
    const h = harness('src/components/StaffAccessState.tsx', {}, { '@/lib/translations': { getSavedLang: () => { if (unavailable) throw Error('Storage blocked'); return 'fr'; } } });
    const render = () => h.render(h.component.StaffAccessState, { kind: 'session', error: 'session_unavailable' });
    render(); const cleanup = h.effects[0](); await settle();
    assert.equal(h.state.lang, unavailable ? 'de' : 'fr');
    assert.match(text(render()), unavailable ? /erneut anmelden/ : /Reconnectez-vous/);
    cleanup();
  }
});

test('session boundary preserves redirects, hides protected content and retains error presentation', async t => {
  const previous = global.window;
  const redirects = [];
  global.window = { location: { replace: path => redirects.push(path) }, addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {} };
  t.after(() => { global.window = previous; });
  for (const outcome of ['absent', 'error', 'valid']) {
    const session = { userId: 'staff', role: 'cashier', cashierEventId: 'a', workstationId: 'station' };
    const h = harness('src/components/StaffSessionBoundary.tsx', {}, {
      'next/navigation': { usePathname: () => '/caisse' },
      '@/lib/staff-auth': { refreshStaffSession: async () => { if (outcome === 'error') throw Error('private'); return outcome === 'absent' ? null : session; } },
    });
    const render = () => h.render(h.component.StaffSessionBoundary, { children: 'protected' });
    assert.equal(render().type.name, 'StaffAccessState');
    const cleanup = h.effects[0](); await settle();
    const tree = render();
    if (outcome === 'valid') assert.equal(text(tree), 'protected');
    else {
      assert.equal(tree.type.name, 'StaffAccessState');
      assert.equal(tree.props.absent, outcome === 'absent');
      assert.equal(tree.props.error, outcome === 'error' ? 'session_unavailable' : null);
    }
    cleanup();
  }
  assert.deepEqual(redirects, ['/team/login']);
});

test('cashier gate keeps missing assignments blocked and technical codes internal', async () => {
  let lifecycles = 0;
  const h = harness('src/components/AssignedCashierGate.tsx', {}, {
    '@/lib/staff-auth': { refreshStaffSession: async () => ({ userId: 'staff', cashierEventId: 'a' }) },
    '@/lib/cashier-lifecycle': { startCashierLifecycle: () => { lifecycles++; } },
  });
  const render = () => h.render(h.component.AssignedCashierGate, { children: 'protected' });
  render();h.effects[0]();await settle();
  const tree = render();h.effects[1]();
  assert.equal(tree.type.name, 'StaffAccessState');
  assert.equal(h.state.accessError, 'workstation_assignment_required');
  assert.equal(tree.props.error, h.state.accessError);
  assert.equal(lifecycles, 0);
});

test('admin restores the shared frame and retains disabled forms while saving', () => {
  const h = harness('src/app/staff/admin/users/page.tsx', { loading: false, busy: true }, { '@/lib/translations': { getSavedLang: () => 'fr' } });
  const tree = h.render();
  assert.equal(tree.type.name, 'StaffPageFrame');
  assert.equal(tree.props.title, 'Utilisateurs et postes');
  assert.ok(findAll(tree.props.actions, node => node.type === 'a' && node.props.href === '/staff/admin').length);
  assert.ok(findAll(tree, node => node.type === 'fieldset').every(node => node.props.disabled));
  const { StaffPageFrame } = load('src/components/StaffPageFrame.tsx');
  const frame = StaffPageFrame(tree.props);
  assert.equal(findAll(frame, node => node.props?.src === '/logo-afrofood.png').length, 1);
  assert.equal(findAll(frame, node => node.props?.['aria-hidden'] === 'true').length, 1);
});
