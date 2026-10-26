/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict');
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
const { load } = require('./ui-harness.cjs');
const { RefundStatus, refundTone } = load('src/components/pos/RefundStatus.tsx');
const props = { lang: 'fr', payment: 'card', amountCents: 100, currency: 'eur' };
const render = refund => renderToStaticMarkup(React.createElement(RefundStatus, { ...props, refund }));
test('normal paid sale stays validated; pending and review have distinct states', () => {
  assert.match(render(null), /Validée/);assert.equal(refundTone(null), 'normal');
  for (const state of ['requested', 'processing']) {
    const html = render({ state, amountCents: 100, currency: 'eur', refundedAt: null });
    assert.match(html, /Remboursement en cours/);assert.doesNotMatch(html, /Validée|REMBOURSÉE/);
    assert.match(html, /data-refund-state="pending"/);
  }
  assert.match(render({ state: 'requires_review', amountCents: 100, currency: 'eur', refundedAt: null }), /Vérification nécessaire/);
});
for (const paymentMethod of ['cash', 'card']) test(`refunded ${paymentMethod} shows original amount, total and correct method`, () => {
  const html = render({ state: 'refunded', paymentMethod, amountCents: 100, currency: 'eur', refundedAt: '2026-10-26T12:00:00Z' });
  assert.match(html, /REMBOURSÉE/);assert.match(html, /1,00/);assert.match(html, /Montant original/);
  assert.match(html, paymentMethod === 'cash' ? /remboursé en espèces/ : /remboursé sur carte/);
  assert.doesNotMatch(html, /Validée/);assert.match(html, /data-refund-state="refunded"/);
});
