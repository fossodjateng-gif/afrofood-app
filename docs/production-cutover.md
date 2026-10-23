# Final integration: manual production cutover

Status: code prepared for final device testing, NOT approval to merge or deploy.
No migration in this batch has been executed. Refund creation/webhook flags stay 0.

## Database preparation (operator, explicit reviewed target only)

1. Take a recoverable database snapshot/backup; record target branch and restore plan without logging credentials.
2. Run `scripts/production_preflight.sql` read-only. It requires the historic orders baseline and checks duplicate POS keys. Review its catalog/index output against the prerequisite and existing migrations, including optional tables already present. IF NOT EXISTS does not repair an incompatible existing table/index. Stop on mismatch; no automatic type conversion or data cleanup.
3. With psql and ON_ERROR_STOP, run `scripts/prepare_production.sql`. Exact order:
   - production_preflight.sql (read-only)
   - prepare_production_prerequisites.sql (orders additions, nullable quantity_applied, POS/PI fields and unique indexes, menu/config tables, terminal mailbox, cashier lease table)
   - create_staff_auth_refunds.sql (server accounts/sessions/audit/refunds and creator attribution)
   - add_staff_workstations.sql (assignment, payer/register attribution, authorization functions; does NOT newly activate the protocol trigger)
   - add_refund_request_context.sql (historical refund request context)
4. Re-run preflight, inspect schemas/indexes/functions. Review backups and existing records; no invented historical payer, station, quantity or refund attribution. Existing historical rows retain NULL quantity_applied. Unique index creation may block writers; use a maintenance window sized to the real orders table. Each included file is atomic, the whole sequence is not: on error stop, investigate, rerun idempotent steps after review.
5. Provision real staff through the existing reviewed provisioning procedure, never through pasted credentials. Configure events/workstations and explicit assignments through the authenticated admin UI after deployment. Do not activate unassigned cashier accounts.

This preparation is additive. It neither seeds credentials nor changes feature flags. If an earlier preview already has the protocol trigger, replacing its function makes it reject raw and v2 keys immediately: do not apply to a target with legacy clients still running.

## Controlled boundary: no old and new tills concurrently

1. Complete or reconcile every in-flight card attempt using its existing order/PI. Do not start a second payment to resolve uncertainty. Close all old browser till tabs, native clients, backgrounded devices and suspended/bfcache pages. Suspend access to the old deployment/aliases and retire direct old deployment URLs; a trigger alone cannot retrofit authorization into old payment APIs.
2. Freeze sales on the old version. Wait at least 120 seconds AFTER the final old heartbeat; verify no unexpired raw-event or v2 leases. Do not delete live leases manually. New acquisition conservatively refuses any live non-v3 lease across events until expiration.
3. Manually run `scripts/enforce_cashier_v3_cutover.sql` in this same reviewed database. It refuses activation while legacy leases remain live and then installs/replaces the version trigger without dropping data. Raw-event and v2 writes subsequently fail with cashier_protocol_upgrade_required. Never run this in the earlier additive-preparation phase while old tills are in service.
4. Only after final physical-device approval: merge the tested WIP commit, deploy the approved version through the normal release process, retire old clients/URLs, reload browsers and reconnect staff. No automatic merge or Production deployment is performed by the development batch.
5. Reconnect each cashier to their explicit server event/workstation. Validate different workstations on one event operate concurrently; a second tab/device for the same station is blocked. Kitchen stations share a queue without exclusive cashier leases. Verify refresh, back, logout and reassignment.
6. Smoke public tracking (including a stale staff cookie), staff login/logout, admin stats, kitchen availability, cash attribution/retry, card reservation/confirmation/audit and receipt printing. Refund stays unavailable with both flags OFF.

A stale old payment API must not remain reachable to staff during cutover. Otherwise old main can bypass guards even though its lease heartbeat fails. This operational isolation is a hard release prerequisite, not solved by the trigger.

Rollback: keep tills closed. Do not simply restore old application code against a v3-only protocol/database while accepting payments. Reconcile in-flight orders/PI first, assess backward compatibility and explicitly review any protocol rollback. No destructive SQL rollback is supplied.

## Required final physical tests (test-mode Stripe, approved Preview only)

- Build the native app against the exact Preview API base URL and appropriate test Terminal location; verify cookie persistence and server Origin behavior on a physical iPhone. Do not use the default Production URL for Preview testing. Existing local eas.json is deliberately untouched.
- Same staff account on browser and native app, assigned to the same event/workstation: reserve order/PI on browser, retrieve that existing PI on mobile, complete the official Tap to Pay setup and test payment; allow kitchen to advance immediately to IN_PROGRESS/READY/DONE before mobile observes webhook. Verify one charge and immutable payer/register attribution.
- Wrong account/workstation, reassignment, inactive workstation, session expiry and logout during navigation: no new PI or reassignment; server rejects stale context. Successful logout waits for revocation, failed logout keeps the local session and allows retry.
- Retry payment/status checks and duplicate webhook deliveries; no duplicate sale, stock change or payer overwrite. Two workstations on one event, station exclusivity, TTL recovery, refresh, back/bfcache and app foreground/background.
- Screens on iPhone/tablet/desktop: login, users/workstations, menu, manual cashier, payment, history, kitchen, public tracking and disabled Refund. Print receipts to PDF/paper; screen-only shared styles must not alter printed receipts.

## Concurrency and local verification limits

Admin mutation guards lock session/user rows before configuration. Station disable locks configuration before revoking sessions, creating a possible cycle with an in-flight guarded sale. PostgreSQL safely aborts a deadlock victim. Admin operations retry the entire transaction, including fresh DB authorization, at most twice, and only for 40P01/40001. IDs/password hashes remain stable across retries; auth/unique/network errors are never retried. Existing CAS checks and revocation/lease cleanup remain intact.

Local tests use SQL/Stripe fixtures with all networking denied. They verify authorization, attribution, retry boundaries and protocol conditions, but do not replace real PostgreSQL migration execution/lock contention checks or iPhone Stripe SDK/device tests. Review and execute SQL only in a separately authorized test database before Production.
