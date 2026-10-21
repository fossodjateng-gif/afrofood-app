/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, harness, findAll } = require('./ui-harness.cjs');

function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}

const expected = {
  de: { review: 'Überprüfung erforderlich', hint: 'Keine neue Kartenzahlung starten.', success: 'Zahlung erfolgreich', statuses: ['Neue Bestellung', 'In Zubereitung', 'Bereit', 'Abgeschlossen'], payments: ['Barzahlung', 'Kartenzahlung'] },
  fr: { review: 'Vérification nécessaire', hint: 'Ne lancez pas un nouveau paiement par carte.', success: 'Paiement réussi', statuses: ['Nouvelle commande', 'En préparation', 'Prête', 'Terminée'], payments: ['Espèces', 'Carte'] },
  en: { review: 'Review required', hint: 'Do not start a new card payment.', success: 'Payment successful', statuses: ['New order', 'In preparation', 'Ready', 'Completed'], payments: ['Cash', 'Card'] },
};

for (const [lang, labels] of Object.entries(expected)) {
  test(`lot 1 ${lang}: review presentation preserves cancellation actions and success precedence`, () => {
    const { CardPayment } = load('src/components/pos/CardPayment.tsx');
    const attempt = { orderId: 'local-order', eventId: 'local-event', amountCents: 1000, cancelRequested: true, cancellationOutcome: 'requires_review' };
    const order = { id: attempt.orderId, event_id: attempt.eventId, payment: 'card', status: 'PENDING_PAYMENT', pos_card_state: 'cancel_requested' };
    let cancellations = 0;
    const props = { attempt, order, lang, onCancel: () => cancellations++ };
    const tree = CardPayment(props);
    assert.equal(text(findAll(tree, node => node.type === 'h2')[0]), labels.review);
    assert.ok(text(tree).includes(labels.hint));
    assert.doesNotMatch(text(tree), /requires_review|cancel_requested/);
    const buttons = findAll(tree, node => node.type === 'button');
    assert.equal(buttons.length, 1);
    buttons[0].props.onClick();
    assert.equal(cancellations, 1);
    const busy = CardPayment({ ...props, busy: true });
    assert.equal(findAll(busy, node => node.type === 'button')[0].props.disabled, true);
    for (const cancellationOutcome of ['cancellation_pending', 'canceled', 'requires_review']) {
      const success = CardPayment({ ...props, attempt: { ...attempt, cancellationOutcome }, receipt: { id: order.id } });
      assert.equal(text(findAll(success, node => node.type === 'h2')[0]), labels.success);
      assert.ok(!text(success).includes(labels.review));
    }
    assert.equal(attempt.cancellationOutcome, 'requires_review');
    assert.equal(order.status, 'PENDING_PAYMENT');
  });

  test(`lot 1 ${lang}: technical errors are mapped in card and cashier UI without losing internal diagnostics`, () => {
    const { CardPayment } = load('src/components/pos/CardPayment.tsx');
    const errors = ['context_mismatch', 'order_not_cancelable', 'cancellation_unavailable', 'PaymentIntent failed: PI=123', 'webhook Stripe', 'unexpected-private-diagnostic'];
    for (const error of errors) {
      const tree = CardPayment({ lang, attempt: null, error });
      const alert = text(findAll(tree, node => node.props?.role === 'alert')[0]);
      assert.ok(alert.includes(labels.hint));
      assert.ok(!alert.includes(error));
    }
    const rawLog = '12:00 PaymentIntent created for local-order: pi_private';
    const h = harness('src/app/caisse/page.tsx', { lang, isUnlocked: true, loading: false, actionError: errors[3], actionLogs: [rawLog, 'existing action'] });
    const rendered = text(h.render());
    assert.doesNotMatch(rendered, /PaymentIntent|PI=|pi_private|webhook Stripe/);
    assert.ok(rendered.includes('existing action'));
    assert.equal(h.state.actionError, errors[3]);
    assert.deepEqual(h.state.actionLogs, [rawLog, 'existing action']);
  });

  test(`lot 1 ${lang}: history localizes statuses and payment without changing rows or receipt props`, () => {
    const rows = ['NEW', 'IN_PROGRESS', 'READY', 'DONE'].map((status, index) => ({
      id: `sale-${index}`, event_id: 'local-event', status, payment: index % 2 ? 'card' : 'cash',
      created_at: '2026-10-21T10:00:00Z', amount_cents: 1000, currency: 'eur', items: [],
    }));
    const before = JSON.stringify(rows);
    const h = harness('src/components/pos/OrderHistory.tsx', { snapshot: { eventId: 'local-event', offset: 0, orders: rows, hasMore: false } });
    const tree = h.render(h.component.OrderHistory, { eventId: 'local-event', lang, selectedOrderId: null, onSelect: () => {} });
    const rendered = text(tree);
    for (const label of [...labels.statuses, ...labels.payments]) assert.ok(rendered.includes(label), label);
    assert.doesNotMatch(rendered, /\bNEW\b|\bIN_PROGRESS\b|\bREADY\b|\bDONE\b/);
    assert.equal(JSON.stringify(rows), before);
    const receipts = findAll(tree, node => node.type?.name === 'OnDemandOrderReceipt');
    assert.deepEqual(receipts.map(node => node.props.order), rows);
  });
}

test('lot 1: pending and canceled panels retain their existing actions without showing success', () => {
  const { CardPayment } = load('src/components/pos/CardPayment.tsx');
  const attempt = { orderId: 'local-order', eventId: 'local-event', amountCents: 1000, published: true };
  const order = { id: attempt.orderId, event_id: attempt.eventId, payment: 'card', status: 'PENDING_PAYMENT', pos_card_state: 'ready' };
  const pending = CardPayment({ attempt, order, lang: 'en' });
  assert.ok(!text(pending).includes('Payment successful'));
  assert.ok(text(pending).includes('Cancel card payment'));
  const canceled = CardPayment({ attempt: { ...attempt, cancelRequested: true, cancellationOutcome: 'requires_review' }, order: { ...order, status: 'CANCELED', pos_card_state: 'canceled' }, lang: 'en' });
  assert.equal(text(findAll(canceled, node => node.type === 'h2')[0]), 'Card payment canceled');
  assert.equal(text(findAll(canceled, node => node.type === 'button')[0]), 'New order');
});
