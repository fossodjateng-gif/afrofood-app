/* eslint-disable @typescript-eslint/no-require-imports */
// Preload for the entire test run. Any unmocked network access fails locally.
const deny = () => { throw new Error('Network access forbidden in fixture tests'); };
globalThis.fetch = deny;
for (const protocol of ['node:http', 'node:https']) {
  const client = require(protocol);client.request = deny;client.get = deny;
}
require('node:net').Socket.prototype.connect = deny;
