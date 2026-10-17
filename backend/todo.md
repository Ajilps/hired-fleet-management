# Backend todo list

Updated 17 October 2026. Execution companion to [development-plan.md](development-plan.md). Checked means implemented and locally verified unless a task explicitly includes merge/deployment; unchecked means still required. Add PR/commit, environment and test evidence when completing a task. Foundation merged in PR #10 at `6688970`; admin authentication merged in PR #11 at `2c526d1`. Command foundation merged in PR #12 at `74b7428`; company/rate APIs merged in PR #13 at `1f3f2d2`. Partner accounts merged in PR #14 at `fa1c83a`; account management is the current slice.

**Current step: M2 — Admin account management, C10.** [Partner PR #14](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/14) merged at `fa1c83a` on 17 October. The owner authorized continuation and selected protecting the last enabled admin who completed password setup. [Account policy](accounts.md) records safe account reads/provisioning, serialized status changes, immediate session revocation and the admin first-login consumer. Redis remains deferred. M3 driver entry/private-file decisions are next. A full account-management UI, partner portal screens and independent review/release evidence remain separate.

Task IDs stay stable when work is split or reordered. Choose owners when selecting a PR; do not infer assignment from this document. Milestone and decision dependencies are in the plan. Every feature task includes its relevant schema, API, tests and documentation; do not defer authorization/concurrency testing to the final phase.

## F — Foundation / M0

- [x] **F01** Create the independent Express/TypeScript package with pinned dependencies and pnpm lockfile.
- [x] **F02** Validate environment settings, bound database pool/query waits and sanitize configuration errors.
- [x] **F03** Add `/health`, database-aware `/ready`, safe error envelopes, request IDs, security headers and explicit CORS.
- [x] **F04** Map users/sessions to the DBML and add the initial migration with native types and named keys/indexes.
- [x] **F05** Verify offline client generation, frozen install, build, typecheck, lint and source/SQL naming checks.
- [x] **F06** Pass 6 unit/HTTP tests and 3 real PostgreSQL tests; verify blank migration deployment and repeated deployment.
- [x] **F07** Configure backend CI; build/run the runtime image and verify missing-schema/outage readiness and graceful shutdown locally.
- [x] **F08** Inspect the complete foundation diff/migration and commit the intended files; preserve unrelated work. Foundation committed as `1dfdeeb`; reviewed source/configuration, the two-table migration, Docker/CI, tests and plan/checklist. Generated files, dependencies and local configuration remain ignored.
- [ ] **F09** Reproduce setup using pinned Node 26.11.1 on a clean checkout; record teammate evidence and run GitHub backend CI. Author verification passed from a clean export of `1dfdeeb` with Node 26.11.1/pnpm 12.14.0: frozen install, offline generation/build, schema validation, blank migration/repeat deployment, typecheck, lint, 6 unit/HTTP and 3 PostgreSQL tests. Remote results are recorded in [PR #10 checks](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/10/checks). Independent teammate setup evidence is still required before checking off this combined task.
- [ ] **F10** Open the foundation PR to `development`, obtain independent review and have the repository admin merge it. [PR #10](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/10) merged at `6688970` on 17 October; GitHub records no submitted reviews. Merge is complete, while independent-review evidence for this combined task is not claimed. The owner explicitly authorized the next implementation step.

## A — Accounts and authentication / M1

Authentication merge confirmed at `2c526d1`; the admin portal uses real authentication; remaining account lifecycle and independent review are explicitly separate.

- [x] **A01** Record admin bootstrap/session policy and coordinated OpenAPI/client changes in [authentication.md](authentication.md): normalized email, Argon2id, session-bound JWTs, absolute expiry and owner-selected HttpOnly cookie with origin/CSRF/CORS guards. Bootstrap uses operator-owned permanent credentials; partner mandatory first-login change is now implemented in C07; admin provisioning/client lifecycle is now implemented in C10. Independent security review is still required.
- [x] **A02** Select PostgreSQL fixed-window login/IP/account/refresh limits, bounded hash concurrency and fail-closed storage behavior. Thresholds/configuration/maintenance are documented; no Redis session or limiter dependency is introduced.
- [x] **A03** Implement the operational admin command and explicit test fixtures with two synthetic admins; no shared/default password, public admin registration or overwrite of existing accounts. Independent operational/security review remains a PR gate.
- [x] **A04** Implement strict admin credential validation/login and persistent sessions with safe browser/native DTOs. Partner membership-derived identity is added in C07–C08; driver integration remains deferred without fabricated scope.
- [x] **A05** Implement session/account/role checks and current-admin identity; scoped session operations return 404 for other accounts.
- [x] **A06** Implement locked refresh rotation, durable consumed-token reuse revocation, logout, paginated own-session listing and revocation.
- [x] **A07** Prove wrong/disabled/expired/revoked/forged credentials and refresh races/reuse fail correctly. Unit/PostgreSQL tests pass, including cross-account denial, transport separation and concurrent rotation. Production-image checks prove secure cookies, compiled bootstrap, sanitized authentication failure during a database outage, `/health` 200, `/ready` 503 and graceful exit 0. Independent security review remains a PR gate.
- [x] **A08** Integrate real admin login/current-admin/logout, reload restoration and pre-expiry renewal. Live desktop/mobile tests use real API/PostgreSQL with no interception; they verify private refresh cookies, rotation, two-tab access and cross-tab logout. Business Overview sections remain unavailable until their APIs land. Partner first-login API enforcement is added in C07; its partner portal screen remains pending.

## C — Durable commands, companies and rates / M2

Requires M1 plus DEC-05/10/13. Add resource versions only where the contract declares them.

- [x] **C01** Design/persist command replay scope, fingerprint, request/result lifecycle, retention, in-progress recovery and uncertain-result behavior. [Policy](commands.md), DBML/OpenAPI and migration agree on actor/method/path/key scope, HMAC fingerprints and 25-hour retention. No separately committed pending lease can strand a command.
- [x] **C02** Implement current authorized replay before new-write preconditions, changed-input rejection and stable results after response loss. Real PostgreSQL tests cover separate clients, concurrent duplicates, permission/session changes, rollback, connection loss, explicit durable denial and expired-key reuse. Company/rate and partner provisioning consumers are verified; administrative account consumers are implemented in C10; later domain consumers remain pending.
- [x] **C03** Add aggregate-version/strong-ETag helpers and a branded shared transaction context; runtime proxy hides nesting/lifecycle/unsafe APIs. Fixture aggregate contention proves one version advance and stored replay despite the old tag. Actual order/trip version columns and child-change propagation follow with those modules; independent review remains a PR gate.
- [x] **C04** Add append-only audit persistence with coordinator-owned actor/request identity and projected before/after fields. Replay creates no duplicate event; sensitive fields abort the whole workflow. Database triggers reject update/delete/truncate; failure after audit but before replay persistence rolls back every effect. Audit HTTP reads follow separately.
- [x] **C05** Add companies, memberships and rates with named keys/indexes, exact split/interval CHECKs, one open interval, GiST overlap exclusion and immutable history. Membership uniqueness/role guards follow the one-company-per-partner design; provisioning is exposed and tested in C07.
- [x] **C06** Implement real admin list/create/detail/update and rate list/create, all writes using durable commands and atomic audit. Company plus initial rate commits together. Deactivation preserves history reads; rate changes serialize with database-chosen effective times. Future intake/closure integration remains in its milestone.
- [x] **C07** Implement partner account list/provisioning; user, membership, safe audit and replay commit atomically. Normalized email conflicts never overwrite accounts. Raw passwords/hashes/tokens are excluded from replay/audit; duplicate/racing intent and rollback tests pass. Owner-selected mandatory first-login change is enforced in auth.
- [x] **C08** Strict DTOs, current session/account/role/restriction checks, signed actor/company/collection cursors and repeatable-read totals are implemented. Partner identity derives from current membership; own-company reads work only after password change, foreign/unknown companies return 404, and all admin operations deny partners. Two-company, removed/moved membership, disabled user and stale credential tests pass.
- [x] **C09** Live desktop/mobile tests use real API/PostgreSQL for company list/create/detail/rates and partner list/provisioning/reload, first-login restriction/change, private cookie invalidation, refresh and admin-portal role denial. This completes the current admin frontend slice; partner portal screens and profile/rate editing controls remain separate client work.
- [x] **C10** Implement authenticated safe account list/detail and admin creation/status APIs using the command foundation. Owner-selected last-usable-admin protection serializes status changes before actor locks, preserves one usable admin under simultaneous self/cross-disables, and revokes all target sessions atomically. New admins require first-login change through the real admin screen and fresh sign-in. Signed role/actor cursors preserve microseconds and totals. Full account-management UI and independent review remain separate.

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

1. **Account management:** review and merge C10 APIs, last-usable-admin safeguard and admin first-login consumer.
2. **Driver foundation:** D01 — settle entry, private storage/scanner/retention and onboarding constraints before dependent M3 endpoints.
3. **Client follow-ups:** partner portal first-login screens and full admin account-management UI remain separate frontend work.


Account-management slice verified locally on 17 October 2026: backend build/typecheck/lint/Prisma validation, **25 unit/HTTP tests** and **76 PostgreSQL integration tests** passed. Admin build/lint, **420 unit/component tests**, **128 intercepted desktop/mobile browser checks** and **6 live desktop/mobile checks** passed. Live tests use the actual API and PostgreSQL for authentication, companies/partners and admin provision → password setup → fresh sign-in → disable/enable. Populated/repeated migrations preserve credentials/history and exact cursor microseconds; API checks cover 84 operations and DBML export passes. The Node 26.11.1 production image passed compiled bootstrap, restricted Secure HttpOnly browser sign-in, verified password change, all-session revocation, final-usable-admin protection, re-enable without session resurrection, authorized replay and readiness. It exited 0 on SIGTERM; task containers, database volume and network were removed. Initial browser checks caught a mobile grid overflow; the corrected layout passes 320–1440px checks. Host checks use Node 26.5.0 and local browser checks use installed Chrome; CI uses the pinned runtime and Playwright Chromium. Full account-management UI, partner portal screens, independent review and managed/pilot validation remain pending.

Local partner evidence: backend 22 unit/HTTP and 59 PostgreSQL tests, admin 391 unit/component tests, 122 intercepted browser checks and 4 live desktop/mobile checks passed. Build/typecheck/lint/Prisma, populated/repeated migration, API/DBML and compiled production provisioning/password-change/replay smoke checks passed. See [verification](README.md#verification). Implementation `fd5253d` is in [merged PR #14](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/14), targeting `development`; [remote checks](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/14/checks) are tracked by GitHub. The production image exited 0 and task containers/database volume/network were removed. CI exposed a mobile modal focus-order assumption; the partner browser test now verifies bounded wraparound and containment per Tab instead of pressing Tab twice unconditionally. Ten repeated desktop/mobile Chrome checks passed; remote check results remain linked above. Independent review and partner portal screens remain pending.

Local company evidence on 17 October 2026: backend build/typecheck/lint/Prisma validation, 21 unit/HTTP and 46 PostgreSQL tests; admin build/lint, 390 unit/component tests, 122 intercepted browser regressions and 4 live auth/company tests; API/DBML/Compose validation; populated upgrades/repeated deployment and production image company/replay/rate/readiness/shutdown smoke checks. Source and tests distinguish completed C05/C06 from the remaining partner portions of C08/C09. Disposable Docker resources were removed. Implementation commit `2d02788` is in [merged PR #13](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/13), targeting `development`; [remote checks](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/13/checks) are recorded by GitHub. Independent review and managed/pilot validation remain pending.

Local command evidence on 17 October 2026: implementation commit `9c8c0f7` is in [merged PR #12](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/12), targeting `development`; see [remote checks](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/12/checks). Build/typecheck/lint/Prisma validation, 17 unit/HTTP tests, 31 PostgreSQL integration tests, 2 live desktop/mobile auth tests, populated upgrades, repeated deployment, API/DBML checks and compiled production workflow/readiness/shutdown smoke tests passed locally. No frontend source changed, so the full mock-only frontend suite was not repeated for this increment. Disposable Docker resources were removed. Independent review and actual company/account integration remain pending.

Local authentication evidence on 17 October 2026: backend build/typecheck/lint, 10 unit/HTTP and 16 PostgreSQL integration tests; populated foundation-schema upgrade; admin build/lint, 389 unit/component tests, 122 intercepted browser regressions and 2 live desktop/mobile auth tests; API contract checks; production image build/bootstrap/login/outage/shutdown. Disposable Docker resources were removed. See [verification](README.md#verification) and [live-test setup](authentication.md#setup-and-tests). Independent review, teammate setup, managed infrastructure and pilot sign-off are not claimed.

Do not check off a task because an endpoint exists, the frontend mock passes or an adjacent task landed. Record the task's actual behavior, denied/failure paths and applicable evidence.
