# HireD Indexing and Integrity Strategy

Reviewed 4 October 2026. These are proposed PostgreSQL migration rules, not executed migrations. [hired.dbml](./hired.dbml) declares ordinary indexes/unique keys; DBML notes and this document describe additional checks/services needed for the [database design](./database-design.md).

## Prisma migration integration

Prisma ORM is selected; exact release/configuration remains DEC-01. Put the rules below in the one reviewed migration history described in [schema ownership](database-design.md#prisma-models-and-schema-ownership). These SQL examples are requirements for future migrations, not a second independently applied schema.

Map supported keys/indexes to the declared database names. Check what the pinned release can express; preserve all remaining partial indexes, CHECKs and immutable-row triggers through its supported custom SQL migration path. Inspect generated operations/SQL for unintended table/column renames, duplicate indexes or removal of custom objects. Do not hand-edit generated metadata that the selected tool requires to be regenerated.

Use reviewed parameterized SQL for company-then-trip `FOR UPDATE` locks and worker `FOR UPDATE SKIP LOCKED` claims where needed, on the same transaction context as the related writes. Values must be bound parameters; identifiers come only from reviewed static SQL. Typed model access and an isolation default do not replace locks or permanent trip-credit uniqueness.

Test full migration history from blank PostgreSQL and upgrade from the previous supported schema with representative data. Assert custom constraints/indexes/triggers in the catalog and prove they reject invalid writes, then run concurrent closure/replay tests. Later schema diffs and introspection must retain these invariants. Version-specific migration commands belong in the scaffold, following [Prisma migration documentation](https://www.prisma.io/docs/orm/migrations/how-migrations-work).

## Query indexes

PostgreSQL indexes primary keys and unique constraints automatically. Avoid duplicating them.

| Index | Query / rationale |
| --- | --- |
| `orders(status, created_at)` | Admin order inbox |
| `orders(company_id, created_at)` | Partner history and selected-company volume reports |
| `orders(requested_pickup_at)` | Scheduled-order filters |
| `drivers(status, created_at)` | Pending onboarding queue; activation independent of online availability |
| `trips(current_driver_id, status)` | Current driver's operational list; completed history uses payroll driver instead |
| `trips(status, scheduled_pickup_at)` | Dispatch and live ongoing trips |
| `trips(company_id, closed_at)` | One/many-company closed-trip reports and month selection |
| `trips(closed_at)` | All-company closed-trip reports; company-leading index cannot efficiently serve every unfiltered date range |
| `trip_assignments(driver_id, status, assigned_at)` | Driver work and assignment history |
| `trip_expenses(trip_id, logged_at)` | Expense confirmation and report generation |
| `trip_payroll_records(company_id, calculated_at)` | Selected-company financial reports; calculation time is closure time |
| `trip_payroll_records(driver_id, calculated_at)` | Completed history and payout totals across that driver's companies |
| `wallet_transactions(driver_id, created_at)` | Wallet history; reverse B-tree scan supports newest first |
| `driver_score_events(driver_id, created_at)` | Optional score history |
| `statements(company_id, period_start)` (unique) | One statement per company/month |
| `notifications(status, next_attempt_at)` | Due outbox work |
| `notifications(company_id, created_at)` | Company-scoped email intent troubleshooting |
| `notifications(user_id, created_at)` | Recipient history |
| `audit_logs(entity_type, entity_id, created_at)` | Record audit history; reverse scan supports newest first |

Use deterministic timestamp/ID pagination. Totals are computed over the entire authorized/filter range, before pagination. Measure with representative data and `EXPLAIN ANALYZE`; do not add every possible report combination preemptively. No JSON GIN index is proposed for immutable report rendering.

## Conditional uniqueness and worker recovery

```sql
CREATE UNIQUE INDEX uq_one_active_assignment_per_trip
  ON trip_assignments (trip_id) WHERE status = 'active';

CREATE UNIQUE INDEX uq_current_driver_document_type
  ON driver_documents (driver_id, document_type) WHERE is_current = true;

CREATE UNIQUE INDEX uq_one_trip_credit
  ON wallet_transactions (trip_id) WHERE transaction_type = 'trip_credit';

-- Proposed MVP: each partner login belongs to one company.
CREATE UNIQUE INDEX uq_partner_company_membership
  ON company_users (user_id);

CREATE INDEX ix_expired_notification_claim
  ON notifications (lease_expires_at) WHERE status = 'processing';
```

The wallet trip ID must be non-NULL for `trip_credit`; otherwise the partial unique index would not protect it. Keep the unique `idempotency_key` as an additional defense. Worker claims use `FOR UPDATE SKIP LOCKED` and a lease token. Recovery and acknowledgement check the current lease token; index selection does not itself guarantee safe delivery.

## Proposed CHECK constraints

Apply these in migrations after planning any required data backfill. The repository currently has no live data/migration to change.

```sql
ALTER TABLE trip_expenses
  ADD CONSTRAINT ck_expense_positive CHECK (amount > 0),
  ADD CONSTRAINT ck_expense_description CHECK (length(btrim(description)) > 0),
  ADD CONSTRAINT ck_expense_category CHECK (length(btrim(expense_type)) > 0);

ALTER TABLE orders
  ADD CONSTRAINT ck_order_eta CHECK (
    (route_distance_km IS NULL OR route_distance_km > 0)
    AND (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0)
    AND (admin_eta_minutes IS NULL OR admin_eta_minutes > 0)
    AND ((estimated_duration_minutes IS NULL) = (estimated_duration_source IS NULL))
    AND (estimated_duration_source IS NULL OR estimated_duration_source IN ('maps', 'distance_heuristic'))
    AND eta_source IS NOT DISTINCT FROM CASE
      WHEN admin_eta_minutes IS NOT NULL THEN 'admin_override'
      WHEN estimated_duration_minutes IS NOT NULL THEN estimated_duration_source
      ELSE NULL END
    AND ((estimated_duration_source IS NOT DISTINCT FROM 'distance_heuristic') = (estimate_average_speed_kmh IS NOT NULL))
    AND ((estimated_duration_source IS NOT DISTINCT FROM 'distance_heuristic') = (estimate_policy_version IS NOT NULL))
    AND (estimate_average_speed_kmh IS NULL OR estimate_average_speed_kmh > 0)
    AND (estimate_policy_version IS NULL OR length(btrim(estimate_policy_version)) > 0)
    AND (estimated_duration_source IS DISTINCT FROM 'distance_heuristic' OR route_distance_km IS NOT NULL)
    AND (estimated_duration_source IS DISTINCT FROM 'distance_heuristic'
      OR estimated_duration_minutes::numeric = ceil(route_distance_km * 60 / NULLIF(estimate_average_speed_kmh, 0)))
    AND ((admin_eta_minutes IS NULL) = (eta_overridden_by_user_id IS NULL))
    AND ((estimated_duration_minutes IS NULL) = (eta_calculated_at IS NULL))
    AND (eta_source IS NULL OR eta_updated_at IS NOT NULL)
  );

ALTER TABLE trips
  ADD CONSTRAINT ck_trip_eta CHECK (
    (route_distance_km IS NULL OR route_distance_km > 0)
    AND (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0)
    AND (admin_eta_minutes IS NULL OR admin_eta_minutes > 0)
    AND ((estimated_duration_minutes IS NULL) = (estimated_duration_source IS NULL))
    AND (estimated_duration_source IS NULL OR estimated_duration_source IN ('maps', 'distance_heuristic'))
    AND eta_source IS NOT DISTINCT FROM CASE
      WHEN admin_eta_minutes IS NOT NULL THEN 'admin_override'
      WHEN estimated_duration_minutes IS NOT NULL THEN estimated_duration_source
      ELSE NULL END
    AND ((estimated_duration_source IS NOT DISTINCT FROM 'distance_heuristic') = (estimate_average_speed_kmh IS NOT NULL))
    AND ((estimated_duration_source IS NOT DISTINCT FROM 'distance_heuristic') = (estimate_policy_version IS NOT NULL))
    AND (estimate_average_speed_kmh IS NULL OR estimate_average_speed_kmh > 0)
    AND (estimate_policy_version IS NULL OR length(btrim(estimate_policy_version)) > 0)
    AND (estimated_duration_source IS DISTINCT FROM 'distance_heuristic' OR route_distance_km IS NOT NULL)
    AND (estimated_duration_source IS DISTINCT FROM 'distance_heuristic'
      OR estimated_duration_minutes::numeric = ceil(route_distance_km * 60 / NULLIF(estimate_average_speed_kmh, 0)))
    AND ((admin_eta_minutes IS NULL) = (eta_overridden_by_user_id IS NULL))
    AND ((estimated_duration_minutes IS NULL) = (eta_calculated_at IS NULL))
    AND (eta_source IS NULL OR eta_updated_at IS NOT NULL)
  ),
  ADD CONSTRAINT ck_expense_confirmation_pair CHECK (
    (expenses_confirmed_at IS NULL) = (expenses_confirmed_by_driver_id IS NULL)
  );

ALTER TABLE trip_reports
  ADD CONSTRAINT ck_report_version CHECK (snapshot_version > 0),
  ADD CONSTRAINT ck_report_json_object CHECK (jsonb_typeof(report_snapshot) = 'object'),
  ADD CONSTRAINT ck_report_expense_total CHECK (total_expense_amount >= 0),
  ADD CONSTRAINT ck_report_chronology CHECK (closed_at >= started_at);

ALTER TABLE notifications
  ADD CONSTRAINT ck_notification_resource CHECK (
    (event_type IN ('order_accepted', 'order_rejected')
      AND order_id IS NOT NULL AND statement_id IS NULL)
    OR (event_type = 'statement_published'
      AND statement_id IS NOT NULL AND order_id IS NULL)
  ),
  ADD CONSTRAINT ck_notification_attempts CHECK (attempt_count >= 0),
  ADD CONSTRAINT ck_notification_template_version CHECK (template_version > 0),
  ADD CONSTRAINT ck_notification_claim CHECK (
    (status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  ADD CONSTRAINT ck_notification_sent_time CHECK (
    (status = 'sent') = (sent_at IS NOT NULL)
  );

ALTER TABLE statements
  ADD CONSTRAINT ck_statement_period CHECK (
    EXTRACT(DAY FROM period_start) = 1
    AND period_end = (period_start + INTERVAL '1 month')::date
  ),
  ADD CONSTRAINT ck_statement_version CHECK (content_version > 0),
  ADD CONSTRAINT ck_statement_lifecycle CHECK (
    (status = 'draft' AND submitted_at IS NULL AND verified_at IS NULL
      AND published_at IS NULL AND published_by_user_id IS NULL)
    OR (status = 'pending_verification' AND submitted_at IS NOT NULL
      AND verified_at IS NULL AND published_at IS NULL AND published_by_user_id IS NULL)
    OR (status = 'verified' AND submitted_at IS NOT NULL AND verified_at IS NOT NULL
      AND published_at IS NULL AND published_by_user_id IS NULL)
    OR (status = 'published' AND submitted_at IS NOT NULL AND verified_at IS NOT NULL
      AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL)
  ),
  ADD CONSTRAINT ck_statement_chronology CHECK (
    submitted_at >= created_at AND verified_at >= submitted_at AND published_at >= verified_at
  );

ALTER TABLE statement_approvals
  ADD CONSTRAINT ck_approval_version CHECK (content_version > 0);

ALTER TABLE statement_items
  ADD CONSTRAINT ck_statement_line_rates CHECK (
    applied_driver_percent BETWEEN 0 AND 100
    AND applied_company_percent BETWEEN 0 AND 100
    AND applied_driver_percent + applied_company_percent = 100
  ),
  ADD CONSTRAINT ck_statement_line_totals CHECK (
    trip_amount >= 0 AND driver_share_amount >= 0 AND company_share_amount >= 0
    AND driver_share_amount + company_share_amount = trip_amount
  );

ALTER TABLE wallet_transactions
  ADD CONSTRAINT ck_trip_credit_links CHECK (
    transaction_type <> 'trip_credit'
    OR (trip_id IS NOT NULL AND payroll_record_id IS NOT NULL AND amount >= 0)
  );
```

The lifecycle CHECK intentionally permits only Phase 1 statement states; existing `void` is reserved. JSON Schema is validated in the closure service, not by the PostgreSQL JSON-object CHECK. Date/time checks cannot establish actor permissions or cross-row business invariants.

## Cross-row/service invariants

Use locked services and, where appropriate, triggers/composite foreign keys. Ordinary CHECK constraints cannot query related rows.

- Admin role is required for activation/ETA overrides/approvals/publication; all admins have the same access.
- Notification user is an authorized company partner; referenced order/statement belongs to that same company and matches the event/committed transition. Business transition and intent enqueue are atomic.
- A report's trip, payroll, company and closing driver agree; JSON IDs/timestamps and amounts match the relational snapshot. Payroll/report/credits and closed expense rows are immutable. A mutable external payment status must not rewrite the report.
- `current_driver_id` agrees with the active assignment; reassignment or expense mutation clears confirmation; confirmation actor is the current driver at close. Assignment/expense/closure writes lock the trip.
- First driver activation records both actor/time; later transitions preserve those first-activation fields and append audit records.
- Statement lines belong to the same company and closed calendar-month range as the statement; copied rates/amounts match payroll and totals match lines.
- Pending/verified/published content is frozen. Approval identities are the creator and one other active admin, and approval versions match the frozen statement. Prevent a second different noncreator and record every approval time.
- Publication rechecks the approvals under the statement lock and atomically writes publisher/time/audit/email intent. Partner reads apply the proposed published-only gate before returning rows or aggregates.
- Rate validity windows do not overlap for a company; split totals 100%; rate writes and closure use the same company lock. Applied percentages and shares are immutable snapshots.
- Enforce account-derived company/driver scope for every list, nested object, count, attachment and export. A SQL index does not provide authorization.
