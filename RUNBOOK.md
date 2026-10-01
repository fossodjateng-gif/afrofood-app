# AfroFood Runbook (Cashier / Stripe)

## 1) Daily startup checklist

- Verify app is reachable: `/menu`, `/cart`, `/caisse`, `/kitchen`.
- Verify env in deployment:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_CAISSE_PIN`
- In Stripe, verify webhook endpoint is active:
  - `https://afrofood-app.vercel.app/api/stripe/webhook`
  - Event enabled: `payment_intent.succeeded`

## 2) Card payment flow (normal)

1. Customer creates order (card) -> status `PENDING_PAYMENT`.
2. Cashier clicks `Demarrer Stripe Tap to Pay` on `/caisse`.
3. Payment is completed on terminal/mobile.
4. Stripe sends `payment_intent.succeeded`.
5. Webhook updates order to `NEW`.
6. Kitchen sees the order and can move `NEW -> READY -> DONE`.

## 3) Card payment safety

Card orders must not be manually moved from `PENDING_PAYMENT` to `NEW`.
Only the Stripe `payment_intent.succeeded` webhook should validate a card order
after Tap to Pay / Terminal has processed the payment.

## 4) Incident checks

### A) Order stuck in `PENDING_PAYMENT`

- Stripe Events: check `payment_intent.succeeded` exists for the same `pi_...`.
- Stripe Webhooks: delivery must be `200`.
- If webhook says `order_not_found`:
  - Payment is not linked to Afrofood order.
  - Keep the order in `PENDING_PAYMENT` and investigate the missing PaymentIntent link.

### B) Webhook delivery failed

- Check endpoint URL and secret.
- Resend event from Stripe dashboard.
- Re-check response status and body.

### D) Stripe CLI quick test (sandbox)

1. Login:
   - `stripe login`
2. Trigger a success event:
   - `stripe trigger payment_intent.succeeded`
3. Trigger with an explicit order metadata (if needed):
   - `stripe trigger payment_intent.succeeded --override payment_intent:metadata.order_id=20260227-001`
4. Verify:
   - Stripe event exists
   - webhook delivery is `200`
   - app response reason is not `ignored`
   - order transitions `PENDING_PAYMENT -> NEW`

### C) Tap to Pay button creates PI only

- Expected if terminal collection is not integrated on the same device.
- Do not manually confirm the card order. Complete the payment through Terminal and wait for the Stripe webhook.

## 5) Go-live safety

- Do not keep test keys in production.
- Rotate keys if exposed.
- Use a strong `NEXT_PUBLIC_CAISSE_PIN`.
- Keep one low-amount real transaction test after each deployment.

## 6) Useful status map

- `PENDING_PAYMENT`: waiting cashier/stripe confirmation
- `NEW`: paid and sent to kitchen
- `READY`: order ready for pickup
- `DONE`: completed
