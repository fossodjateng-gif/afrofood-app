/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, findAll } = require('./ui-harness.cjs');

const Link = () => null;
const admin = { username: 'Admin', role: 'admin', cashierEventId: 'testmaison', workstationId: 'station' };
function page(file, query = '', seed = {}, extra = {}) {
  const h = harness(file, { lang: 'fr', ...seed }, {
    'next/link': Link,
    'next/navigation': { useSearchParams: () => new URLSearchParams(query) },
    '@/lib/staff-auth': { getSession: () => admin, getStaffRoleLabel: () => 'Admin' },
    '@/lib/translations': { getSavedLang: () => 'fr', saveLang() {} },
    '@/lib/payment-platform': { detectClientPlatform: () => 'other' },
    ...extra,
  });
  const component = h.component.default;
  const render = () => h.render(file.includes('/stats/') ? component : component().props.children.type);
  return { h, render };
}
function back(tree) {
  return tree.props.back || findAll(tree, node => node.props?.children === 'Retour' && node.props?.href)[0];
}

test('menu returns explicitly to the register or workspace without following browser history', () => {
  for (const view of ['add', 'pricing', 'payment']) {
    const register = page('src/app/admin/menu/page.tsx', `view=${view}&from=caisse`, { isUnlocked: true, staffRoleSession: 'admin' });
    const link = back(register.render());
    assert.equal(link.props.href, '/caisse');
    assert.equal(link.type, 'a', 'Register entry retains document navigation for V3');
    const workspace = page('src/app/admin/menu/page.tsx', `view=${view}&adminEventId=testmaison`, { isUnlocked: true, staffRoleSession: 'admin' });
    const eventBack = back(workspace.render());
    assert.equal(eventBack.props.href, '/staff/admin/events?eventId=testmaison');
    assert.equal(eventBack.type, Link);
  }
});

test('kitchen returns preserve their entry context and display session reads are shared', () => {
  for (const file of ['src/app/kitchen/page.tsx', 'src/app/screen/page.tsx', 'src/app/staff/cuisine/availability/page.tsx']) {
    for (const [query, expected] of [['', '/staff/cuisine'], ['from=caisse', '/staff/cuisine?from=caisse'], ['adminEventId=testmaison', '/staff/admin/events?eventId=testmaison']]) {
      let reads = 0;
      const p = page(file, query, {}, { '@/lib/staff-auth': { getSession: () => { reads++; return admin; }, getStaffRoleLabel: () => 'Admin' } });
      const link = back(p.render());
      assert.equal(link.props.href, expected);
      assert.equal(link.type, Link);
      assert.equal(reads, 1);
    }
  }
  const entry = page('src/app/staff/cuisine/page.tsx', 'from=caisse');
  assert.equal(back(entry.render()).props.href, '/caisse');
  assert.equal(back(entry.render()).type, 'a');
});

test('both statistics screens return directly to Administration', () => {
  for (const isUnlocked of [false, true]) {
    const p = page('src/app/stats/page.tsx', '', { isUnlocked });
    const link = back(p.render());
    assert.equal(link.props.href, '/staff/admin');
    assert.equal(link.type, Link);
  }
});

test('opening the editor reads only the edited event, without invisible summaries or assignments', async t => {
  const previousFetch = global.fetch;
  const calls = [];
  global.fetch = async url => {
    calls.push(url);
    return Response.json({ ok: true, sections: [], storeConfig: { activeEventId: 'testmaison', events: [{ id: 'testmaison', name: 'TestMaison' }, { id: 'other', name: 'Other' }] } });
  };
  t.after(() => { global.fetch = previousFetch; });
  for (const query of ['view=pricing&adminEventId=testmaison', 'view=pricing&from=caisse']) {
    calls.length = 0;
    const p = page('src/app/admin/menu/page.tsx', query, {
      isUnlocked: true, staffRoleSession: 'admin', storeConfig: { events: [{ id: 'testmaison' }, { id: 'other' }] },
    });
    p.render();
    assert.equal(p.h.state.pricingEventId, 'testmaison', 'Context is available before the first request');
    for (const effect of p.h.effects) effect();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(p.h.state.pricingEventId, 'testmaison', 'Initial load does not change context and trigger a second read');
    assert.deepEqual(calls, ['/api/admin/menu-config?eventId=testmaison']);
  }
});
