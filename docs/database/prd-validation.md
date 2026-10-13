# PRD Validation: Seven Database Areas

**Reviewed:** 4 October 2026  
**Source:** [HireD PRD v0.2](https://github.com/shahid123s/buildathon-resources/blob/main/hire_d_prd_doc.md), verified status, dated 30 September 2026. Re-read Sections 2–8, including the priority tables, exclusions, assumptions and open questions. The URL follows `main`; no upstream commit has been pinned.

**Later baseline review:** the [requirements traceability guide](../requirements-traceability.md) records a pinned PRD revision reviewed on 10 October 2026, with feature priorities and integration gaps. The findings below retain their original review date.

**Owner-selected infrastructure:** Docker, Redis caching, managed PostgreSQL and a modular monolith are recorded separately in the [decision log](../decision-log.md#3-selected-architecture-decisions). They are implementation choices, not additional PRD feature requirements; open product-policy proposals below remain open.

**Initial estimation update, 10 October 2026:** DEC-31 selects a labelled rough estimate from supplied road kilometres and server speed, plus admin override. [Estimation design](../travel-time-estimation.md), OpenAPI, DBML and the report schema now carry that draft source/evidence. Maps-based B-04 remains later P1 work; the original maps-related findings/checks below describe that requirement, not a provider enabled in the initial build. Speed/limits are still DEC-32 choices. The [ERD PDF](HireD_Phase_1_Database_ERD.pdf) was refreshed and verified from the current DBML on 10 October 2026; UI/client synchronization remains open.

**Scope:** `project/BASAP`. This repository contains design documents/DBML and an ERD PDF, not executable backend code or migrations. Findings below validate the design, not a deployed database. Requirements in the PRD describe the product; suggested mechanics below are explicitly identified as proposals.

## Findings and updates

| Requested area | Finding in the previous BASAP design | PRD evidence | Update |
| --- | --- | --- | --- |
| ETA/duration storage | Partly present: trips already had maps duration, override and source; orders had none, and precedence/freshness were undefined | B-04 (P1), Section 6 Trip ETA; maps approach also an assumption in Section 8.1 | Add matching order fields, timestamps/admin identity on both, estimate-unavailable handling, override precedence and acceptance-copy rules |
| Email/notification intent tracking | `notifications` existed, but generic payload/status lacked resource scope, recipient snapshot, retry state and intent deduplication | B-07 (P1); rejection also P0 A-05 and Section 4 | Define three typed events and a transactional outbox with company/resource links, template, recipient, deduplication, worker lease, attempts and provider outcome |
| Trip report snapshot definition | `trip_reports` and an immutable JSON field already existed, but contents and payroll linkage were underspecified; one closure description omitted report creation | B-05/D-09 (P0), Section 5.4 expenses/payroll report | Add payroll link and snapshot version; define JSON Schema; generate report inside the same closure transaction as payroll and wallet |
| Driver onboarding status | Already represented by `drivers.status` (pending/active/inactive/suspended) and `onboarded_at`; activation actor/semantics were missing | A-09/D-02 (P0), Section 3.2 excludes formal verification | Retain a single status, add first-activation admin and queue index, separate activation from availability and formal document verification |
| Reporting/multi-company scope | Operational company IDs existed, but seven report contracts, date semantics and aggregate scope were not defined | A-13 (P1), Section 5.5 seven reports, Sections 2 and 7 access rules | Specify all seven report sources, optional one/many/all-company admin filters, ownership restrictions for partners/drivers, whole-range totals and supporting indexes |
| Expense categorization | `expense_type` was already present; categories are not required by PRD. Description was nullable despite the high-level model | D-08/D-09 (P0), Section 6 Expense amount/description, Sections 5.4 and 8.3 reimbursement | Make category optional in the API with storage default `other`; require nonempty description, positive recorded amounts, explicit no-expense confirmation and confirmation actor |
| Invoice/statement publication | Lifecycle and `published_at` already existed; publisher, verification/submission times, approval version and trip-wise item rates were incomplete | B-06/A-12 (P0), B-07 (P1), Sections 4.1 and 5.4 | Add lifecycle metadata, frozen content version and copied line rates; define creator-plus-second-admin gate and atomic publication/email intent |

## What is required versus proposed

- **Required:** maps-derived estimates with override for orders/trips (B-04); email on rejection, acceptance and publication (B-07); auto-generated closed-trip report with expenses/payroll; operational admin activation; all seven admin reports; expense entry before OTP closure; creator and one other admin approval before publication. Rejection email is part of the P0 order-decision flow.
- **Proposed implementation:** minute-based duration fields and ETA derivation; outbox leases/retry strategy; immutable JSON report format; activation completeness gate; category labels and explicit no-expense confirmation; multi-company filter syntax; month timezone/date selection; version-frozen statement content; published-only partner visibility.
- **Not required:** a formal document verification workflow, mandatory expense taxonomy, push/SMS delivery, GPS tracking, driver/company ownership, driver accept/reject, in-app cash-out/payment gateway, honor-score assignment gates or automated misconduct penalties.

## PRD ambiguities retained for team decisions

| Question | Working design, not a confirmed PRD decision |
| --- | --- |
| B-04 specifies maps/override, while Section 8.1 calls it still assumed | Support both; distinguish unavailable data and preserve overrides |
| Section 5.4 excludes expenses from split; Section 8.1 still calls exclusion assumed | Separate report-only expenses; reimbursement unspecified |
| D-09 requires expenses logged, but does not explain zero-expense trips | Explicit empty-list confirmation satisfies the proposed completion gate |
| A-09 requires uploads/admin activation but does not explicitly require all four before activation | Proposed four-current-document gate; operational review only |
| Section 5.4 and B-06 say access follows verification; Section 4.1 has a separate publication stage | Proposed partner access only once published; keep verification/publication metadata distinct |
| Calendar-month billing timezone/date basis and unfinished-month generation | Proposed Asia/Kolkata month using actual closure time; completed months only |
| Reassignment at any time versus frozen closed-trip finances | Proposed pre-close reassignment only; closing driver receives whole share |
| Success/delay metric thresholds and "live" report meaning | Label provisional policy; proposed auto-refreshing ongoing list |
| Email recipients/retry limits and non-email channels | Proposed active designated partner recipients, bounded retries, email only |
| Offline cash-out effect on balance | No MVP debit workflow; balance semantics need confirmation before pilot |

## Acceptance checks for implementation

These are planned checks, not passed application tests.

1. **ETA:** order estimate appears before acceptance; acceptance copies it; clearing an override falls back to maps; maps refresh never overwrites an active override; unavailable maps is not zero duration; override changes are audited.
2. **Notifications:** each accepted/rejected order and published statement creates the corresponding company-scoped email intent in the same transaction. Retry of the business action does not duplicate intents. Provider failure schedules retries; lease expiry recovers a crashed worker; stale workers cannot acknowledge another claim. Missing recipients are visible to admins.
3. **Snapshot:** valid OTP produces one report/payroll/credit together; failed closure produces none. The snapshot validates against the JSON Schema, reconciles to relational IDs and exact numeric totals, and remains unchanged after later profile/rate/payment metadata changes. No OTP/private document/storage secrets appear.
4. **Onboarding:** pending accounts appear in the queue; activation records admin/time; pending/inactive users cannot execute trips; availability is independent; document replacements retain history without implying verification.
5. **Reports:** an admin can view all companies or a selected set; selected totals equal the sum of those company totals; pagination never changes aggregates; a partner cannot fetch other-company rows/counts/exports and a driver cannot fetch another driver's history. All seven report types work with explicit date bases.
6. **Expenses:** omitted category defaults to `other`; empty description/zero/negative recorded amount is rejected; receipt is optional; no-expense confirmation is explicit; mutation/reassignment clears confirmation; closed expenses cannot be changed; totals exclude expenses from commission under the working rule.
7. **Statements:** same admin twice, two noncreators or an approval for a stale content version cannot satisfy the gate. Cross-company/month items fail. Publication records publisher/time and one email intent; email failure leaves the statement published. Trip-wise rates and totals remain frozen after later rate edits.

## Updated artifacts

- [hired.dbml](./hired.dbml): canonical tables, fields, relationships and index declarations.
- [database-design.md](./database-design.md): behavior, scope, lifecycle and transaction contracts.
- [trip-report-snapshot.schema.json](./trip-report-snapshot.schema.json): version-1 immutable report payload contract.
- [indexing-strategy.md](./indexing-strategy.md): index rationale, proposed constraints and service invariants.
- [database-research.md](./database-research.md) and [yaml.md](./yaml.md): synchronized mapping and manifest.
- [HireD_Phase_1_Database_ERD.pdf](HireD_Phase_1_Database_ERD.pdf): current local DBML export; [regeneration and verification guide](erd-export.md).

## Design validation evidence

- Parsed the revised DBML with `@dbml/core`: 25 tables, 13 enums and 56 relationships; PostgreSQL export succeeded. Fixed pre-existing single-line enum/index formatting and unsupported `>?` reference syntax; optionality remains defined by nullable columns.
- Compiled the report schema with a Draft 2020-12 validator. Thirteen focused contract checks passed: expense/no-expense/unknown-ETA/zero-price snapshots are accepted; numeric money, blank description, zero expense, missing closure time, OTP exposure, unpaired coordinates, inconsistent ETA, uncredited payout and wrong schema version are rejected.
- ERD export refreshed on 10 October 2026: 25 tables, 283 columns, 56 declared foreign keys and 13 enums across 8 pages. PDF text coverage and layout bounds passed; all pages were rendered and visually inspected with embedded fonts. The [export record](erd-export.md#verified-export-10-october-2026) identifies the exact source hash. No DBML/schema changes were made for this export.
- These checks validate artifact syntax and consistency. Planned ownership, concurrency, arithmetic, email-provider and lifecycle checks above still require an implementation.
