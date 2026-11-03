// One shared manager represents same-origin browser contexts. No storage/network I/O.
function cartLocks() {
  const tails = new Map();
  return { request(name, options, callback) {
    if (typeof options === 'function') callback = options;
    const result = (tails.get(name) || Promise.resolve()).then(() => callback({ name, mode: 'exclusive' }));
    tails.set(name, result.catch(() => {}));
    return result;
  } };
}
function installLocks(t, manager = cartLocks()) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: manager } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'navigator', previous); else delete globalThis.navigator; });
  return manager;
}
module.exports = { cartLocks, installLocks };
