# Staff sessions and total card refunds — WIP

Implemented and tested with fixtures only. No migration, provisioned real user,
Preview deployment or real Stripe operation has been performed.

## One staff login

`/team/login` authenticates admin, cashier and kitchen through the same
`/api/staff/session` endpoint. Passwords use salted scrypt. A random 256-bit token
is returned only in an HttpOnly, SameSite=Strict, Path=/ cookie (Secure on HTTPS
or in production). Only its SHA-256 hash is stored in PostgreSQL. Sessions expire
absolutely after two hours; the server checks the current active user and role
on every protected request. Logout revokes the stored session before navigation.
Successful login replaces/revokes the browser's previous session.

Staff pages wait for the server session before mounting. The synchronous
`getSession()` API remains a display cache in memory for existing components;
it never reads localStorage as authentication. Refresh/focus rechecks the server.
An actor header only rejects stale tabs after a cashier switch; it never grants
identity or permissions. Refund uses this same login, without reauthentication.

Permission: active cashier OR admin may use the register. A cashier is restricted
to `staff_users.cashier_event_id`; admin may act on any order's nonempty event.
Kitchen and unknown roles cannot refund. Paul and Marie have separate user IDs
and session rows even on the same event. No event-level session exists.

## Controlled migration / remaining compatibility

Provision trusted accounts explicitly; never import browser roles/passwords.
No privileged account is seeded. Existing local account-management functions
remain for legacy display compatibility, with passwords scrubbed from that
cache. They DO NOT create/change/disable server accounts. Use the provisioning
tool for server changes, which also revokes sessions. The legacy account screen
is labelled accordingly. Old cached carts stay keyed by individual user ID;
preserve reviewed legacy user IDs during provisioning if existing attempts must
be resumed. Old credentials are not reused automatically.

Existing action attribution before this change:

* A: no individual cashier identity was authenticated server-side. A signed
  payment webhook proves Stripe's origin, not the individual cashier.
* B: POS card creator and cancellation context had durable IDs, but originally
  came from browser declarations. POS card creation/cancellation now derive
  them from the common server session.
* C: POS cash creation lacked a creator. New cash orders now store `created_by`
  and a readable username snapshot. Refund stores the first `requested_by`.

Migrated API boundaries: POS cash/card creation, order-status mutations (including
cash validation), card-cancellation route, staff sales history and Refund.
`staff_action_audit` records the authenticated actor of these cashier requests;
it records requests, including retries/failures, not a second financial ledger.
Cash/card totals, cancellation transitions and sale finalization are unchanged.

NOT YET MIGRATED: legacy menu/admin configuration and PIN APIs, cashier locks,
Terminal publication/preparation APIs and some general order reads/public order
creation. Those paths still have their previous authorization limitations.
Do not describe this WIP as a completed security migration of every API.
Native Terminal/mobile has not been changed. Preview regression tests must check
whether any native status call needs a separately designed authentication path;
there is intentionally NO insecure header/PIN fallback in migrated routes.

## Database preparation (operator at home only)

Review/apply `scripts/create_staff_auth_refunds.sql` against Neon Preview AFTER
the existing orders schema exists. It creates:

* staff_users, staff_sessions, staff_login_limits;
* order_refunds (unique order, PaymentIntent, operation key and Refund ID);
* staff_action_audit and nullable cash creator fields on orders.

There is no runtime DDL in authentication, Refund or history. Deploy only after
the additive migration and explicit provisioning; otherwise staff login fails
closed. No mock/localStorage fallback will authenticate real users.

`scripts/provision-staff-user.mjs` reads one JSON object from stdin: id (optional
when first creating a reviewed legacy identity), username, password, role,
active, cashierEventId. Do not put real credentials in shell arguments/history,
Git or a committed JSON file. Default is validation/dry run with NO DB access.
Only the explicit `--apply` flag connects to DATABASE_URL. Updating a username
preserves its server ID and revokes all of that user's sessions. Non-admin
accounts require an event assignment. Use unique strong new credentials.

Environment in Preview:

* DATABASE_URL: Preview DB only;
* STAFF_AUTH_ORIGIN: exact HTTPS browser origin, without trailing slash;
* existing STRIPE_SECRET_KEY: matching Stripe test environment initially;
* REFUND_CREATE_ENABLED: default off; set to 1 ONLY after reviewing the Stripe
  contract, credentials, migration and authenticated Preview tests;
* REFUND_WEBHOOK_ENABLED: default off;
* STRIPE_REFUND_WEBHOOK_SECRET: dedicated endpoint signing secret.

No session-signing secret is needed for opaque DB sessions. Login throttling is
durable: 120 total and 8 per normalized username per 15-minute bucket. Plan
maintenance to delete old expired/revoked sessions and old login buckets.

## Refund semantics

GET /api/orders/[id]/refund only reads/reconciles an existing operation. POST
requires same-origin + valid session + register permission + event scope.
The server ignores client requested_by/amount/role. It requires a paid Stripe
card sale with a supported validated order status, explicit EUR amount and PI.
The PI must match ID, succeeded status, amount, amount_received, currency and
metadata.order_id. Current menu prices are never consulted.

The unique DB claim is committed BEFORE Stripe, without holding a transaction
across HTTP. First claim wins requested_by permanently. All callers share
`afrofood-refund-full:v1:<refund_key>` and frozen parameters. A second claimant
never replaces the actor. Existing known Refund ID is retrieved; otherwise all
list pages are read. Exactly one matching full external refund can be adopted;
partial, multiple or inconsistent results require review. Refunds from another
operation key are never silently adopted as ours.

After timeout, an empty list is not proof of non-execution. Only a requested
operation within 23 hours may replay the exact same key/parameters. Outside
that conservative window it requires review, even with an empty list. Stripe
idempotency retention and API contract MUST be confirmed before enabling.
Failures never generate a new key. A known pending Refund never creates another.
DB failures after Stripe success are recovered by retrieval/listing on retry.

No row = none; requested -> processing/refunded; ambiguity -> requires_review.
Verified evidence can resolve review. Success is never downgraded. refunded_at
is AfroFood's confirmation time, not promised bank settlement time.

Refund writes only order_refunds. It never updates order.status,
quantity_applied, availability or items; never calls finalizeSale, changes
kitchen status, republishes Terminal or prints. Statistics remain gross sales.

## Isolated webhook contract — verify at home

The existing payment_intent.succeeded endpoint is untouched. The new disabled
refund-webhook endpoint verifies HMAC, timestamp freshness and retrieves current
Stripe state. Candidate fixture event types are refund.created, refund.updated,
refund.failed. These names/payloads have NOT been verified externally here.
Configure/enable only after Stripe test fixtures verify the real contract.
It never creates a refund or local request. Duplicates/order changes reconcile
current state; uncertain Stripe reads return a retryable error.

## Required Preview checks

HTTPS cookies/origin, real PostgreSQL uniqueness/concurrency, login/logout and
account switch across tabs, rate limits across instances, provisioning/revocation,
old pending attempts and native status callers. Then existing Tap to Pay,
full refunds, dashboard refunds, duplicate/out-of-order webhooks, timeouts before
and after Stripe success, and failed DB persistence. Use a dedicated test
environment first. No real payment/refund is authorized by this implementation
task. No deployment/commit/push has been performed.
