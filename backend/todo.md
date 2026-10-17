# Backend todo list

Updated 17 October 2026. Execution companion to [development-plan.md](development-plan.md). Checked means implemented and locally verified unless a task explicitly includes merge/deployment; unchecked means still required. Add PR/commit, environment and test evidence when completing a task. Foundation work is being finalized on `feature/backend-foundation`; no business feature is delivered yet.

**Current step: M0 — Foundation.** Local implementation and verification are complete. The next gates are clean-environment/remote CI evidence, independent review and the admin merge. Authentication follows this foundation; Redis caching remains deferred until measured workload justifies it.

Task IDs stay stable when work is split or reordered. Choose owners when selecting a PR; do not infer assignment from this document. Milestone and decision dependencies are in the plan. Every feature task includes its relevant schema, API, tests and documentation; do not defer authorization/concurrency testing to the final phase.

## F — Foundation / M0

- [x] **F01** Create the independent Express/TypeScript package with pinned dependencies and pnpm lockfile.
- [x] **F02** Validate environment settings, bound database pool/query waits and sanitize configuration errors.
- [x] **F03** Add `/health`, database-aware `/ready`, safe error envelopes, request IDs, security headers and explicit CORS.
- [x] **F04** Map users/sessions to the DBML and add the initial migration with native types and named keys/indexes.
- [x] **F05** Verify offline client generation, frozen install, build, typecheck, lint and source/SQL naming checks.
- [x] **F06** Pass 6 unit/HTTP tests and 3 real PostgreSQL tests; verify blank migration deployment and repeated deployment.
- [x] **F07** Configure backend CI; build/run the runtime image and verify missing-schema/outage readiness and graceful shutdown locally.
- [x] **F08** Inspect the complete foundation diff/migration and commit the intended files; preserve unrelated work. Reviewed source/configuration, the two-table migration, Docker/CI, tests and plan/checklist; generated files, dependencies and local configuration remain ignored.
- [ ] **F09** Reproduce setup using pinned Node 26.11.1 on a clean checkout; record teammate evidence and run GitHub backend CI.
- [ ] **F10** Open the foundation PR to `development`, obtain independent review and have the repository admin merge it. Local checks do not satisfy this task.

## A — Accounts and authentication / M1

Requires F10 and the auth/account decision gates. First integration target: the admin portal.

- [ ] **A01** Record DEC-03 choices: email normalization, hashing/policy, token/session design, browser refresh transport, lifetimes, bootstrap and first-login password behavior. Update OpenAPI/client contracts for any changes.
- [ ] **A02** Select login/refresh abuse limits, store and outage behavior; record any DEC-30 implications. Do not silently adopt critical Redis state.
- [ ] **A03** Implement a reviewed operational first-admin command and explicit local/test fixtures with two synthetic admins; no shared default password or public admin registration.
- [ ] **A04** Implement credential validation/login and session persistence, returning only the selected safe identity/token DTOs.
- [ ] **A05** Implement protected-request session/account validation, role guards and `getCurrentUser`; distinguish role denial from out-of-scope resource hiding.
- [ ] **A06** Implement atomic refresh rotation/reuse handling, logout, own-session listing and own-session revocation.
- [ ] **A07** Prove wrong/disabled credentials, expired/revoked sessions, refresh races/reuse and service outages fail correctly (QA-01/02/23).
- [ ] **A08** Integrate real admin login/current-admin/logout/expiry and refresh behavior; verify private cache cleanup without auth interception. Implement first-login/password-change behavior only with its agreed contract. Keep unimplemented Overview sections visibly unavailable.

## C — Durable commands, companies and rates / M2

Requires M1 plus DEC-05/10/13. Add resource versions only where the contract declares them.

- [ ] **C01** Design/persist command replay scope, fingerprint, request/result lifecycle, retention, in-progress recovery and uncertain-result behavior; reconcile GAP-05 with DBML/OpenAPI.
- [ ] **C02** Implement authorized replay before new-write version checks, changed-payload rejection and stable results after response loss; include concurrent duplicate tests.
- [ ] **C03** Add reviewed aggregate-version/ETag handling and shared transaction-context conventions; prove repository helpers cannot commit workflow writes independently.
- [ ] **C04** Add audit persistence with sanitized actor/action/resource/time and before/after data where required; no credentials/codes/file secrets.
- [ ] **C05** Add companies, company memberships and payout-rate models/migrations, named constraints and non-overlapping effective-rate enforcement.
- [ ] **C06** Implement company list/create/detail/update and rate list/create; commit company and initial rate atomically and follow agreed deactivation/rate policy.
- [ ] **C07** Implement partner account list/provisioning; commit user plus membership atomically and preserve exact replay behavior without retaining raw passwords in replay payloads.
- [ ] **C08** Implement company-scoped authorization, strict DTOs, opaque deterministic cursors, full-filter totals and decimal-string serialization with two-company denial tests.
- [ ] **C09** Integrate the real admin Companies/create/detail/partner flows and partner identity scope; verify conflict/retry, historical rates and audit (QA-02/05/13/21/31).
- [ ] **C10** After C01–C02, implement authenticated admin account reads/creation/status APIs with declared idempotency, the agreed last-active-admin safeguard and session revocation on disable. Do not implement these writes ahead of their replay dependency.

## D — Drivers and private files / M3

Requires auth, resource scope/replay and DEC-02/06/07/08/09. Resolve retention before real identity data.

- [ ] **D01** Record driver entry, file size/type/context rules, scan provider, signed-access lifetime/cleanup and initial activation policy. Keep draft limits distinct from approved policy.
- [ ] **D02** Add driver profile/document/file models and durable upload owner/purpose/context; add one-current-document uniqueness and necessary integrity SQL.
- [ ] **D03** Implement the selected driver entry flow and own-profile reads; create pending drivers, never operationally active drivers by default.
- [ ] **D04** Implement private quarantine upload, content/size validation, scan lifecycle and scoped metadata; provide deterministic synthetic scanner/storage tests.
- [ ] **D05** Implement owned/contextual clean-document attachment and document lists, with masked numbers and complete cursor behavior.
- [ ] **D06** Implement freshly authorized clean-file download links and synthetic storage/CORS integration; reject swapped, unattached, pending and rejected file IDs.
- [ ] **D07** Implement driver directory/detail and initial activation with atomic eligibility rechecks, reason/audit, replay and preserved first activation history.
- [ ] **D08** Integrate real admin directory/profile/document preview/activation and the driver onboarding flow; verify disabled accounts and missing/unclean uploads (QA-02/03/08/23/24/31).
- [ ] **D09** Record whether X01's underlying availability capability is delivered early for the existing admin calendar. Until delivered, preserve an explicit unavailable state rather than synthetic empty results.

## O — Orders, trip reads and email / M4

Requires company/rates, driver scope and durable commands. Settle close-code material policy before acceptance and DEC-20 before email transitions.

- [ ] **O01** Add orders, the acceptance-required trip fields/code material and durable notification outbox models/migrations, including one-trip-per-order integrity.
- [ ] **O02** Implement scoped order list/detail and strict partner/admin intake; derive partner company/source server-side and reject forged/unknown fields.
- [ ] **O03** Implement acceptance/rejection with state/version checks, atomic trip/audit/email-intent writes and replay; use exact contract amount strings.
- [ ] **O04** Prove accept-versus-reject and duplicate acceptance races, stale versions, rollback and lost-response recovery (QA-05/06/21/31).
- [ ] **O05** Record recipients, missing-recipient behavior, backoff/attempt limits, provider idempotency and manual retry policy under DEC-20.
- [ ] **O06** Implement the separate outbox worker with durable claims/leases, stale-acknowledgement protection and bounded retries; test crash after provider acceptance with synthetic transport.
- [ ] **O07** Implement sanitized notification list/detail/retry and audit reads; preserve business outcomes during email outages (QA-19/21).
- [ ] **O08** Implement scoped trip list/detail and assignment-history reads for accepted-order handoff; enforce row/count/total/file boundaries.
- [ ] **O09** Integrate real admin Orders and partner intake. Verify Overview Orders/Trips through existing list endpoints; track Statements separately until M6.

## T — Assignment, execution, closure and earnings / M5

Requires M2–M4 and DEC-04/11/12/13/14/15. Financial concurrency evidence is part of this milestone.

- [ ] **T01** Record code entropy/expiry/lockout/key policy, zero-price use, expense rules, closure-effective rounding, reassignment ownership and selfie/start behavior.
- [ ] **T02** Add assignment/execution/expense/payroll/report/wallet models and reviewed CHECKs, partial indexes, permanent uniqueness and immutable-row enforcement.
- [ ] **T03** Implement assignment/reassignment with enabled active-driver checks, atomic access transfer/version change and invalidated expense confirmation (QA-08).
- [ ] **T04** Implement one authoritative start transition, own positive expenses/edit/delete, optional receipt ownership and complete-list/empty confirmation (QA-09/10).
- [ ] **T05** Implement partner-only code reveal, protected driver validation and durable failed-attempt/replay/lockout accounting outside failed financial transactions (QA-11/23).
- [ ] **T06** Implement company-then-trip locking and one closure transaction across trip, assignment, exact payroll, frozen report, wallet credit, audit and required intents.
- [ ] **T07** Validate the canonical frozen report schema/relational identities; expose authorized report/payroll/earnings reads and full-range totals without withdrawals/manual credits.
- [ ] **T08** Prove concurrent close, rate-edit/close, reassignment/close and expense-confirmation races using independent database connections and barriers.
- [ ] **T09** Inject failures before/after commit and replay-record expiry; prove complete rollback or the same permanent single credit/report/payroll result (QA-12/13/15/31).
- [ ] **T10** Verify immutable history after profile/rate/payment-status changes and former-driver denial (QA-14/21).
- [ ] **T11** Integrate one real partner → admin → driver trip journey through earnings/report reads, including response loss and recoverable errors.

## S — Monthly statements / M6

Requires immutable closure/payroll, two admins and the outbox. Resolve DEC-16/17; exclude DEC-18 exceptions until specified.

- [ ] **S01** Record month/timezone, partner visibility, content/version and exception scope; align contracts and clients.
- [ ] **S02** Add statement/item/approval models and one-company-month, immutable-content and approver constraints.
- [ ] **S03** Implement generation and creator-only draft regeneration from closed payroll with exact totals and IST exclusive month boundaries.
- [ ] **S04** Implement submission and explicit creator-plus-one-distinct-other approval of the same frozen version; prevent noncreator pairs, third approvers and stale approval races.
- [ ] **S05** Implement atomic publication/audit/email intent and own-company partner reads under the agreed visibility gate.
- [ ] **S06** Prove duplicate generation/publication, concurrent approvals, email outage and frozen totals/history (QA-16–19/21/31).
- [ ] **S07** Integrate real admin review/publication and partner statement views; verify the Overview Statements tile with real scoped totals.

## X — Explicit P1/P2 extensions / M7

Select scope and timing explicitly. An unchecked extension does not authorize weakening its underlying P0 access or financial rules.

- [ ] **X01 · P1 interaction / P0 directory dependency** Implement online state and date availability separately; scoped reads/writes, IST/exclusive ranges, complete pagination and no invented booked intervals. Integrate the existing admin calendar and driver controls; record early delivery scope (QA-04).
- [ ] **X02 · P1** Resolve DEC-32 and implement supplied-distance rough estimates/admin overrides with server policy/evidence, unavailable handling and immutable accepted/closed basis (QA-07). Keep later maps integration separately open.
- [ ] **X03 · P1** Resolve DEC-19/24 and implement all seven scoped admin reports with agreed denominators/date bases/totals. Add exports only under a matching agreed contract (QA-20).
- [ ] **X04 · P1** Implement optional trip-selfie attachment/read with current assignment/private-file checks; do not silently make it a start requirement (QA-09/23).
- [ ] **X05 · P1** Implement driver completed-history listing and client integration using recorded payroll ownership; keep required closed-report access in M5 (QA-14).
- [ ] **X06 · P2** Implement allowed own-profile edits/document replacement with concurrency control, preserved current upload until commit and retained history (QA-25).
- [ ] **X07 · P1 later** Select/implement a maps provider only as an explicit follow-up to rough estimates; record terms, quotas, normalized provenance and outage policy.

## R — Integration, operations and pilot / M8

Provider/staging preparation can start earlier; complete these gates before pilot.

- [ ] **R01** Assign implementation/review/release/incident/backup owners and record selected P1/P2 delivery scope, open DEC/GAP outcomes and linked implementation PRs.
- [ ] **R02** Configure synthetic staging with managed PostgreSQL, private storage/scanner, email and secrets; verify TLS, runtime/migration privilege separation and connection budgets (QA-24/29).
- [ ] **R03** Select scoped Redis caches/limits/invalidation under DEC-30 and test authorized keys, stampede bounds, restart/pressure/outage fallback. Additional critical roles need their own explicit failure/recovery policy (QA-28/30).
- [ ] **R04** Add sanitized request/audit/worker diagnostics, operational alerts and runbooks without credentials, codes, private file content or signed URLs.
- [ ] **R05** Maintain blank and populated prior-schema migration tests, custom SQL retention and migration failure/repair evidence as the schema grows (QA-31).
- [ ] **R06** Run live admin/partner/Android end-to-end and low-bandwidth/device tests using synthetic fixtures; verify all P0 requirements and retain mock regressions as a separate layer (QA-22/26).
- [ ] **R07** Complete independent auth/authorization/file/code/input security review and resolve release-blocking findings with regression evidence (QA-23).
- [ ] **R08** Agree DEC-23 workload/latency/error/duration thresholds, then verify 1,000 accounts/100 simultaneous active users with financial/scope correctness and resource evidence (QA-32).
- [ ] **R09** Agree retention, backup/key custody and recovery-point/time targets; perform an isolated database/file/key restore and record reconciliation evidence (QA-24/29).
- [ ] **R10** Verify production images/startup/shutdown, compatible migration/deployment/rollback sequencing and supported older clients; do not use the local Compose stack as production configuration (QA-27/31).
- [ ] **R11** Complete the documented pilot gate with independent review, successful remote CI, restored-backup evidence and the full trip-to-statement smoke journey.

## Next PR queue

1. **Foundation:** F08–F10 — review and land the existing local foundation.
2. **Authentication decision:** A01–A02 — concrete selected policy and matching contract updates, with required team/security/mobile review.
3. **Admin authentication:** A03–A08 — bootstrap and real session lifecycle with PostgreSQL/security/client evidence; split into focused PRs if needed.
4. **Commands and company setup:** C01–C10 — establish durable write behavior before expanding business mutations, including account-management writes.

Do not check off a task because an endpoint exists, the frontend mock passes or an adjacent task landed. Record the task's actual behavior, denied/failure paths and applicable evidence.
