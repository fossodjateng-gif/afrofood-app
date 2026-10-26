-- Apply explicitly to an isolated/test database first. Never run at application startup.
-- Existing Stripe refunds retain all identifiers, amounts, states and attribution.
BEGIN;
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '5s';
ALTER TABLE order_refunds ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'card';
ALTER TABLE order_refunds ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;
ALTER TABLE order_refunds ADD CONSTRAINT order_refunds_payment_method_check CHECK (
  (payment_method = 'card' AND stripe_payment_intent_id IS NOT NULL)
  OR
  (payment_method = 'cash' AND stripe_payment_intent_id IS NULL AND stripe_refund_id IS NULL
    AND refund_state = 'refunded' AND refunded_at IS NOT NULL AND currency = 'eur')
);
-- Existing PRIMARY KEY(order_id), UNIQUE(refund_key), UNIQUE(stripe_payment_intent_id)
-- and UNIQUE(stripe_refund_id) remain intact. NULL Stripe IDs are allowed for cash.
COMMIT;
