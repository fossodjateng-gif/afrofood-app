# AfroFood Terminal Mobile

Mobile app (React Native + Stripe Terminal) to run Tap to Pay and link payment to AfroFood orders.

## Prerequisites

- Stripe account with Terminal enabled (live or test).
- iPhone with NFC.
- Xcode installed (for iOS build).
- AfroFood API deployed and reachable.
- In AfroFood server env:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`

## Setup

```bash
cd terminal-mobile
npm install
cp .env.example .env
```

Set in `.env`:

```bash
EXPO_PUBLIC_AFROFOOD_API_BASE_URL=https://afrofood-app.vercel.app
```

## Run on iPhone

Expo Go is not enough (native Stripe Terminal module). Use a dev build:

```bash
npx expo run:ios
```

Then launch from Xcode/device.

## Payment flow

1. Create order in AfroFood (`payment=card`).
2. In mobile app, enter `orderId`.
3. Tap `Create PI from Afrofood order`.
4. Tap `Connect Tap to Pay`.
5. Tap `Collect + process payment`.
6. Check Stripe event `payment_intent.succeeded` and webhook `200`.
7. AfroFood order should move `PENDING_PAYMENT -> NEW`.

## Notes

- This app uses AfroFood backend endpoints:
  - `POST /api/stripe/terminal/connection-token`
  - `POST /api/stripe/terminal/payment-intent`
- If Tap to Pay does not connect, verify Stripe Terminal account/device eligibility and iPhone region requirements.

