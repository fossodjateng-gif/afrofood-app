# Staff sessions and total card refunds — V1

Refund changes are verified offline with network-denied Stripe/DB fixtures.
This work executes no migration, deployment or real Stripe operation. Both
Refund flags remain disabled. Current staff/workstation architecture is described
in [workstations-v1.md](workstations-v1.md).

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

Permission: an active cashier OR admin needs an active cashier workstation in
the order's server-assigned event. POST additionally requires the existing
session/instance-bound cashier lease; GET does not acquire a lease.
Kitchen and unknown roles cannot refund. Paul and Marie have separate user IDs
and session rows even on the same event. No event-level session exists.

## Controlled migration / remaining compatibility

Provision trusted accounts explicitly; never import browser roles/passwords.
No privileged account is seeded. Existing local account-management functions
remain for legacy display compatibility, with passwords scrubbed from that
cache. They DO NOT create/change/disable server accounts. The admin users page
now uses the authenticated server account/workstation API. Old cached carts stay keyed by individual user ID;
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

Workstation authorization, cashier leases, Terminal authentication and staff
order reads have since been implemented separately; see workstations-v1.md.
Refund does not change their code or the payment/Tap to Pay protocol.

## Database preparation (operator at home only)

Review/apply `scripts/create_staff_auth_refunds.sql` against Neon Preview AFTER
the existing orders schema exists. It creates:

* staff_users, staff_sessions, staff_login_limits;
* order_refunds (unique order, PaymentIntent, operation key and Refund ID);
* staff_action_audit and nullable cash creator fields on orders.

Refund request snapshots additionally require the additive
`scripts/add_refund_request_context.sql` (NOT executed by this work). It adds
nullable `requested_by_username`, `requested_event_id`, `requested_register_id`
and `requested_register_name` to `order_refunds`. Existing requests keep NULL
snapshots; no historical identity or workstation is guessed. Review/apply this
separately on the test database before testing new requests in Preview.

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
The server ignores client requested_by/userId/username/event/workstation/role.
Optional `amountCents` must equal the server's full paid amount; partial,
excessive, negative or malformed amounts are refused. It requires a paid Stripe
card sale with a supported validated order status, explicit EUR amount and PI.
The PI must match ID, succeeded status, amount, amount_received, currency and
metadata.order_id. Current menu prices are never consulted.

The unique DB claim is committed BEFORE Stripe, without holding a transaction
across HTTP. The transaction revalidates the lease, locks its authorization rows
and rechecks the eligible order. First claim wins requested_by and its server
username/event/register snapshots permanently, independently of the original
sale's paid_by/paid_register fields, which are never modified. All callers share
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

No row = none; requested -> processing; ambiguity/failure/cancellation ->
requires_review. Even a succeeded creation response only records processing.
A subsequent independent Stripe GET (staff reconciliation or webhook) must
confirm success before refunded. A stale pending response cannot remove review;
verified success can resolve it. Success is never downgraded. refunded_at
is AfroFood's confirmation time, not promised bank settlement time.

Refund writes only order_refunds. It never updates order.status,
quantity_applied, availability or items; never calls finalizeSale, changes
kitchen status, republishes Terminal or prints. Statistics remain gross sales.

The UI shows the order, paid card amount, confirmed refunded amount, remaining
balance and state. Ambiguous/partial/multiple external refunds show balances as
requiring verification rather than inventing an available balance. V1 creates
only full refunds. A pending/review/refunded operation offers no new operation;
only requested can resume its existing key through an authorized POST.

## Isolated webhook contract — disabled

The existing payment_intent.succeeded endpoint is untouched. The new disabled
refund-webhook endpoint verifies HMAC, timestamp freshness and retrieves current
Stripe state. The snapshot event types refund.created, refund.updated and
refund.failed are documented in the [Stripe event catalog](https://docs.stripe.com/api/events/types).
The payload must contain a Refund object with its ID and PaymentIntent ID.
An event for another already-linked Refund ID is ignored. Event payload status
is never used as final proof; current Stripe state is retrieved instead.
The contract was reviewed against the official documentation, not real calls.
It never creates a refund or local request. Duplicates/order changes reconcile
current state; uncertain Stripe reads return a retryable error.

## Required Preview checks

Keep REFUND_CREATE_ENABLED=0 and REFUND_WEBHOOK_ENABLED=0. Select the deployment
for the reviewed commit (an older immutable Preview URL will keep older code).
After the separately approved audit migration, sign in to an assigned cashier
post, acquire its existing lease and inspect history. Cash/unpaid sales must
not offer Refund. For a paid card sale, verify order/amount/confirmation, then
the recorded pending request with no Stripe Refund creation. Repeating must
reuse the request. Missing lease, wrong event/post and unauthenticated calls
must fail; the disabled webhook must return 503. Do not change flags for this
procedure. Success/failure/duplicate/out-of-order webhook paths are exercised
only by the offline mocks while these flags are off.

Run `node --require ./tests/deny-network.cjs --test tests/refund-*.test.cjs`
for the mocked financial scenarios, then the complete tests with the same preload.
Fixtures enable flags only inside their isolated test processes and never alter
local env files or Vercel settings.

HTTPS cookies/origin, real PostgreSQL uniqueness/concurrency, login/logout and
account switch across tabs, rate limits across instances, provisioning/revocation,
old pending attempts and native status callers. A future separately authorized
integration pass can cover full refunds, dashboard refunds, duplicate/out-of-order webhooks, timeouts before
and after Stripe success, and failed DB persistence. Use a dedicated test
environment first. No real payment/refund is authorized by this implementation
task. No deployment/commit/push has been performed.
