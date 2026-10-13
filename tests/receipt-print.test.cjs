/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { harness, findAll } = require('./ui-harness.cjs');

const order = { id: 'historical-paid-001', created_at: '2026-10-08T12:00:00Z', paid_at: '2026-10-12T12:00:00Z', payment: 'card', status: 'DONE', event_name: 'Test event', amount_cents: 1000, items: [{ name: 'Meal', qty: 1, price: 10 }] };
const labels = { ticketTitle: 'Kundenbeleg', ticketSub: 'Bezahlt', order: 'Bestellung', name: 'Name', payment: 'Zahlung', total: 'Gesamt', ticketLegend: 'Allergene', ticketSent: 'Küche', thanks: 'Danke', reprint: 'Beleg drucken' };

function setup({ decode = () => { throw new Error('Printing must not wait for image decoding'); }, fonts = new Promise(() => {}), onPrint = () => {} } = {}) {
  const originalDocument = global.document, originalWindow = global.window;
  const roots = [], listeners = new Map(); let prints = 0, tree, cleanup;
  global.document = {
    body: { appendChild: node => { roots.push(node); node.isConnected = true; } },
    fonts: { ready: fonts },
    getElementById: id => roots.find(node => node.id === id) || null,
    createElement: () => ({ isConnected: false, querySelectorAll: () => [{ decode }], remove() { this.isConnected = false; const index = roots.indexOf(this); if (index >= 0) roots.splice(index, 1); } }),
  };
  global.window = { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); } };
  const h = harness('src/components/OrderReceipt.tsx', {}, {
    'react-dom': { createPortal: (children, target) => ({ type: 'portal', props: { children, target } }), flushSync: fn => { fn(); render(); cleanup = h.effects[0](); } },
  });
  function render() { tree = h.render(h.component.OrderReceipt, { order, lang: 'de', labels, showEvent: true, onPrint: () => { prints++; onPrint(); } }); return tree; }
  render();
  return {
    h, roots, listeners, render, get tree() { return tree; }, get prints() { return prints; },
    click: () => findAll(tree, node => node.type === 'button')[0].props.onClick(),
    dispose: () => { const dispose = cleanup; cleanup = null; dispose?.(); global.document = originalDocument; global.window = originalWindow; },
  };
}

test('explicit print creates one body portal containing the historical ticket, logo and rendered QR, without buttons', () => {
  const s = setup();
  try {
    assert.equal(s.roots.length, 0); assert.equal(s.prints, 0);
    // Mounting a receipt has no printing side effects.
    for (const effect of s.h.effects) effect();
    assert.equal(s.roots.length, 0); assert.equal(s.prints, 0);
    assert.equal(s.click(), undefined);
    assert.equal(s.prints, 1); // The callback runs before the click handler returns.
    assert.equal(s.roots.length, 1);
    assert.equal(s.roots[0].id, 'af-receipt-print-root');
    const portal = findAll(s.tree, node => node.type === 'portal')[0];
    assert.equal(portal.props.target, s.roots[0]);
    assert.equal(portal.props.children.props['data-order-id'], order.id);
    assert.equal(findAll(portal.props.children, node => node.type === 'button').length, 0);
    const logos = findAll(portal.props.children, node => node.props?.className === 'af-ticket-logo');
    assert.equal(logos.length, 1); assert.equal(logos[0].props.loading, 'eager');
    const qr = findAll(portal.props.children, node => node.props?.size === 256 && node.props?.marginSize === 4)[0];
    assert.ok(qr); assert.ok(qr.props.value.includes(order.id));
    s.click(); assert.equal(s.roots.length, 1); // Double click cannot create another root/job.
    assert.equal(s.prints, 1);
    assert.equal(s.roots.length, 1); // Keep alive until Safari emits afterprint.
    s.listeners.get('afterprint')();
    assert.equal(s.roots.length, 0); assert.equal(s.h.state.printTarget, null);
  } finally { s.dispose(); }
});

test('Safari print runs in the click stack even when images and fonts would never settle', async () => {
  let decodeCalls = 0;
  const s = setup({ decode: () => { decodeCalls++; return new Promise(() => {}); }, fonts: new Promise(() => {}) });
  try {
    let microtaskReached = false;
    queueMicrotask(() => { microtaskReached = true; });
    assert.equal(s.prints, 0);
    assert.equal(s.click(), undefined);
    assert.equal(s.prints, 1);
    assert.equal(microtaskReached, false);
    assert.equal(decodeCalls, 0);
    await Promise.resolve(); assert.equal(s.prints, 1);
  } finally { s.dispose(); }
});

test('unmount removes the print portal without scheduling another job', async () => {
  const s = setup();
  try {
    s.click(); assert.equal(s.prints, 1);
    s.dispose(); await Promise.resolve();
    assert.equal(s.prints, 1); assert.equal(s.roots.length, 0);
  } finally { s.dispose(); }
});

test('a thrown print callback cleans up the portal and permits an explicit retry', () => {
  let fail = true;
  const s = setup({ onPrint: () => { if (fail) throw new Error('print unavailable'); } });
  try {
    s.click(); assert.equal(s.prints, 1); assert.equal(s.roots.length, 0);
    assert.equal(s.h.state.printError, true);
    s.render(); assert.equal(findAll(s.tree, node => node.props?.role === 'alert').length, 1);
    fail = false; s.click(); assert.equal(s.prints, 2); assert.equal(s.roots.length, 1);
    assert.equal(s.h.state.printError, false);
  } finally { s.dispose(); }
});

test('thermal CSS removes screen layout and invalid page size, while allowing long receipts to paginate', () => {
  const css = fs.readFileSync('src/app/globals.css', 'utf8');
  assert.equal((css.match(/@media print/g) || []).length, 1);
  assert.doesNotMatch(css, /size:\s*80mm auto|visibility:\s*hidden/);
  const print = css.slice(css.indexOf('@media print'));
  assert.match(print, /@page\s*\{\s*size:\s*auto;\s*margin:\s*0;/);
  assert.match(print, /body:has\(> #af-receipt-print-root\) > :not\(#af-receipt-print-root\)\s*\{ display: none !important/);
  assert.match(print, /max-width: 72mm/);
  assert.match(print, /position: static/);
  assert.match(print, /overflow: visible/);
  assert.match(print, /\.af-ticket-logo \{ width: 25mm; height: auto/);
  assert.match(print, /\.af-ticket-row \{ break-inside: avoid/);
  assert.doesNotMatch(print.match(/#af-receipt-print-root \.af-ticket \{[^}]+\}/)[0], /break-inside/);
  assert.doesNotMatch(fs.readFileSync('src/components/OrderReceipt.tsx', 'utf8'), /innerHTML|cloneNode/);
});
