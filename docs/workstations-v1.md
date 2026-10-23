# Assigned staff workstations

This change requires **scripts/add_staff_workstations.sql** before the new
application can serve operational staff. It is an explicit additive migration;
application startup does not apply it. No migration has been executed by this work.

## Model

The server reads role, `cashier_event_id` and `workstation_id` from `staff_users`
through the authenticated opaque HttpOnly session cookie. The event must exist.
`app_settings[workstations:<eventId>]` contains cashier/kitchen lists of stable
UUIDs, names, types and active flags. Employees never select their assignments.
Unassigned admins can administer accounts and posts; an operational admin needs
an assigned cashier post to acquire a register lease.

`/staff/admin/users` now manages real server accounts and posts. It never imports
the old browser account list. Mutations require server admin authentication and
same-origin checks. Passwords use the existing salted scrypt format. Password
hashes and session tokens are excluded from API projections.

Assignment updates revoke the user's existing sessions and delete leases bound
to those session hashes in the same transaction. Station deactivation does the
same for assigned users. Renaming retains the UUID. There is no delete operation.

## Leases and writes

The register key is `v3:` followed by JSON encoding of `[eventId, workstationId]`.
The owner format deliberately remains `v2:<sessionHash>:<instanceHash>` so logout
cleans every register of the session. TTL remains 120 seconds.

The migration rejects future v2 event-wide acquisitions/renewals, including
requests from old application instances. New acquisition waits for any existing
v2 event-wide lease to expire or be released. During rollout an old page must
reload; logout or the 120-second TTL resolves the legacy lease. Quiesce old
clients during the separately approved Preview rollout. Do not run old and new
protocols without the migration's compatibility trigger.

Both cashier pages use the same lifecycle and lease client. Temporary navigation
detaches locally without releasing the server lease. Handoff, refresh and bfcache
retain the instance and revalidate session/assignment. A new tab gets its own
instance, and cannot join an occupied register. Tab storage is only a hint.

POS writes require the authenticated assigned cashier post and an owner-bound
live lease. `af_assert_cashier_lease` locks session/user, station configuration and
lease rows for the transaction containing creation or cash finalization. Status
mutations also recheck the staff assignment in their transaction. Reassignment,
station edits and revocation cannot race an already guarded database write.

Card preparation reserves its human attribution under the same guard before the
existing payment preparation runs. This is an authorization reservation, not
proof of payment: only the existing paid_at/webhook rules mark the sale paid.
Retries and late confirmations cannot replace the reservation. An authenticated
native terminal can retrieve only the existing intent reserved for its own
staff user and assigned register. Creation still requires the browser lease.
The native login uses the server staff session; deep-link identities and demo
accounts no longer authenticate. SDK calls, amounts, idempotency keys and webhook
payment semantics are unchanged.

## History and kitchen

POS creation stores creator ID/name and register ID/name. Cash finalization
stores the actual encasher and register atomically. Card confirmation preserves
the reserved attribution. Public creation stays anonymous; later encashment gets
its own attribution. No historic data is guessed or backfilled.

Kitchen posts share the event queue; there is no exclusive kitchen lock, routing
by station, or `prepared_by`. Staff kitchen reads and invalidations use dedicated
authenticated endpoints. Private invalidations carry no order data and recheck
the live assignment. Public per-order reads and the public notification path
remain available. General order lists require staff event authorization.

## Rollout and verification limits

Review/apply the migration only through a separately authorized Preview operation.
Using the existing server admin, create posts and assign existing employees.
Employees with missing/inactive/incompatible posts are deliberately blocked.
Then verify independent registers, contention, reassignment, kitchen cooperation,
cash/card attribution, retries, native login and the existing Safari lifecycle.

Automated checks use offline database/Stripe doubles. They do not execute the
migration, prove PostgreSQL lock scheduling, or replace Safari/iPhone Preview
verification. Refund code and flags are outside this change.
