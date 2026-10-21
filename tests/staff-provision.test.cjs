/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
test('provisioning defaults to a network-denied dry run and never prints credentials', () => {
  const input = { id: 'fixture-paul', username: 'fixture-paul', password: 'fixture-only-long-password', role: 'cashier', active: true, cashierEventId: 'event-x' };
  const run = spawnSync(process.execPath, ['--require', './tests/deny-network.cjs', 'scripts/provision-staff-user.mjs'], { input: JSON.stringify(input), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);assert.match(run.stdout, /Dry run/);assert.doesNotMatch(run.stdout + run.stderr, /fixture-only-long-password|scrypt-v1/);
  const invalid = spawnSync(process.execPath, ['--require', './tests/deny-network.cjs', 'scripts/provision-staff-user.mjs'], { input: '{"password":"fixture-only-private', encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);assert.doesNotMatch(invalid.stderr, /fixture-only-private/);
});
