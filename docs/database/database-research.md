# HireD Database Research and Design Rationale

**Submission scope:** HireD Phase 1 database design  
**Recommended primary database:** PostgreSQL 16+  
**Diagram source:** [`hired.dbml`](./hired.dbml)

## 1. Why PostgreSQL

The Buildathon requires an SQL relational database. PostgreSQL is a good fit because HireD has connected operational records (companies, partners, orders, trips and drivers), precise money calculations, audit requirements and one critical all-or-nothing transaction at trip close. It supports foreign keys, constraints, transactions, `numeric` currency fields, JSON snapshots for immutable reports, and partial unique indexes.

NoSQL is not used as the primary database. Files are stored privately in object storage; PostgreSQL stores only their metadata and secure storage key.

## 2. Requirement-to-table mapping

| PRD requirement | Tables that implement it |
|---|---|
| Admin, B2B partner and driver login | `users`, `auth_sessions`, `company_users`, `drivers` |
| B2B company management and partner isolation | `companies`, `company_users` |
| Company-specific payout split and history | `company_payout_rates` |
| Partner or admin creates order | `orders` |
| Accept order and create trip | `orders`, `trips` |
| Driver onboarding and documents | `drivers`, `driver_documents`, `file_assets` |
| Current and future driver availability | `drivers`, `driver_availability_dates` |
| Assignment/reassignment history | `trips`, `trip_assignments` |
| Driver selfie, expense entry and OTP close | `trip_selfies`, `trip_expenses`, `trips` |
| Auto-generated trip report | `trip_reports` |
| Payroll and duplicate-safe wallet credit | `trip_payroll_records`, `wallet_transactions`, `wallet_accounts` |
| Monthly statement and two-person check | `statements`, `statement_items`, `statement_approvals` |
| Email, push or in-app notices | `notifications` |
| Required audit trail | `audit_logs` |
| Driver score, streak and ranking extension | `driver_performance_summaries`, `driver_score_events` |

## 3. Normalization decisions

The operational system is normalized to avoid repeated or inconsistent data:

- A company is stored once in `companies`; partner logins are linked through `company_users`.
- Payout percentages are versioned in `company_payout_rates`, rather than overwriting a company field.
- Files are described once in `file_assets` and referenced by documents, selfies, and receipts.
- Assignment history is separate from `trips`; this prevents reassignment from destroying history.
- Financial records are separate from trips. This preserves the amount and rate actually used at close.

Three deliberate snapshots preserve historical truth:

- `trips` copies the accepted pickup/drop/contact data from `orders`.
- `trip_payroll_records` stores the rate and split applied at close.
- `trip_reports.report_snapshot` and `statement_items` preserve generated partner-facing reports.

## 4. Core integrity rules

The following rules belong in the PostgreSQL migration and backend services:

1. `driver_percent + company_percent = 100` for each payout rate.
2. Amounts and percentages use `numeric`, never float.
3. An accepted order has exactly one trip (`trips.order_id` is unique).
4. A trip has at most one active assignment at a time.
5. One trip creates one payroll record and one automatic `trip_credit` wallet entry.
6. A statement can only be published after the creator and one different admin approve it.
7. Partner requests must be scoped through `company_users`; drivers can only access their own `drivers.user_id` records.
8. Driver files must remain private and be delivered through short-lived signed URLs.

## 5. Atomic trip-close operation

Trip closure must be one PostgreSQL transaction:

```text
Lock ongoing trip
→ validate driver assignment, expense confirmation and OTP
→ mark trip closed
→ find effective company payout rate
→ create immutable payroll record
→ create trip-credit wallet transaction with idempotency key
→ update wallet balance
→ create trip report
→ update driver score/streak summary and audit log
→ commit
```

If any step fails, the database rolls back all steps. This protects the PRD requirement that a payout can never be credited twice.

## 6. Security and privacy decisions

- Passwords and refresh tokens are stored only as hashes.
- OTP validation uses `otp_hash`; a separate encrypted value is used only to show the code to the authorized partner.
- Aadhaar, PAN, PCC, licence, selfie, and receipt bytes are never stored as database blobs.
- `file_assets` holds only metadata, checksum, malware scan result, and private object-storage key.
- `audit_logs` records changes to payout rates, trip amounts, reassignment, verification, and other sensitive actions.

## 7. Indexing

The diagram includes indexes for the partner order list, admin inbox, dispatch screen, driver trip list, wallet history, statement generation, score history and audit lookup. See [`indexing-strategy.md`](./indexing-strategy.md) for the reason behind every index and the additional PostgreSQL partial indexes.

## 8. Submission checklist

- [x] SQL relational design selected
- [x] Tables, columns, data types, primary keys and foreign keys defined
- [x] Cardinality visible in the ERD
- [x] Statuses match the PRD flow
- [x] Money uses `numeric`
- [x] Indexes and normalization decisions documented
- [x] Secure file-storage approach documented
- [x] Duplicate-payout prevention documented
- [x] Two-person statement verification documented
- [x] Diagram source ready for dbdiagram.io export
