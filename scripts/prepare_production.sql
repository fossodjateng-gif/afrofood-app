-- psql entry point, MANUAL ONLY, NEVER executed by the application.
\set ON_ERROR_STOP on
\ir production_preflight.sql
\ir prepare_production_prerequisites.sql
\ir create_staff_auth_refunds.sql
\ir add_staff_workstations.sql
\ir add_refund_request_context.sql
-- Deliberately excludes enforce_cashier_v3_cutover.sql (maintenance boundary).
