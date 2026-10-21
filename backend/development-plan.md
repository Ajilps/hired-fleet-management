# Backend development plan

Updated 18 October 2026. Scope: the shared HireD API for the admin portal, business partner portal and Flutter driver app. Use [todo.md](todo.md) as the execution checklist and [README.md](README.md) for commands and verification evidence.

## Starting point

The foundation merged into `development` in [PR #10](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/10) at `6688970`. It provides Express/TypeScript, Prisma/PostgreSQL, validated configuration, probes, Docker and CI. Admin authentication merged in PR #11 at `2c526d1`, providing real login, refresh-cookie restoration, logout, current identity and own-session management. The command foundation merged in PR #12 at `74b7428`. Company/rate PR #13 merged at `1f3f2d2`; partner PR #14 merged at `fa1c83a`. Admin account-management PR #15 merged at `d7c80b4`, completing C10. Local SeaweedFS PR #16 merged at `f7be6fb`. Driver onboarding PR #17 merged at `71e17f8`. The current increment adds [private uploads/scanning and durable external-write recovery](files.md); [account policy](accounts.md) records the owner-selected last-usable-admin safeguard, management APIs and required admin password setup. See [partner](partners.md), [company](companies.md), [command](commands.md) and [authentication](authentication.md) policies for prior slices, and [verification](README.md#verification) for evidence. Independent review and remote checks remain separate gates in [the checklist](todo.md).

Company/rate admin endpoints, partner provisioning, first-login enforcement and own-company partner reads are implemented. Admin account management and its first-login client are now implemented in C10, with owner-selected last-usable-admin protection. Driver-document upload/scanning, encrypted-number attachments, lists, five-minute downloads and initial activation are implemented locally; Flutter integration, cleanup/retention/calendar, full account-management UI, partner portal screens and other business endpoints remain pending. Dedicated authentication/company browser tests exercise the real API and PostgreSQL; intercepted regressions remain a separate layer.

## Delivery rules

- Deliver a complete behavior with its schema, authorization, validation, tests and client integration. Add models as each workflow needs them rather than translating the entire DBML before exercising it.
- Follow the current [OpenAPI](../docs/api/openapi.yaml), [database design](../docs/database/database-design.md), [security rules](../docs/security-design.md) and [requirements matrix](../docs/requirements-traceability.md). Record policy changes in the [decision log](../docs/decision-log.md) before dependent implementation; update contracts and affected clients together.
- P0 is the release requirement. P1/P2 work stays explicitly scoped; existing frontend support does not change the PRD priority. Rejection email remains P0, and acceptance/publication email intents remain part of the draft transaction contracts.
- PostgreSQL owns business state, replay records, outbox intents and financial integrity. Redis is a scoped cache until an additional role is deliberately selected.
- Each implementation PR targets `development`, has independent review and records actual validation. Do not mark an entire QA case passed from foundation or mock-only evidence.

## Milestones and dependencies

These are delivery milestones, not calendar commitments. Assign task owners and estimates when selecting the next PR. Full-stack developers implement/review API work; Flutter reviews shared contracts; the penetration tester reviews auth/files/codes; the repository admin owns protected-branch merges.

| Milestone | Depends on | Deliverable and acceptance gate | Todo group |
| --- | --- | --- | --- |
| M0 — Foundation | Current local work | Reproducible setup, reviewed migration and green remote CI; foundation PR merged | F |
| M1 — Admin authentication | M0; DEC-03/10 | Operational admin bootstrap, login/refresh/logout, current identity and revocation work against PostgreSQL; admin client authenticates through the real API | A |
| M2 — Reliable commands and companies | M1; DEC-05/10/13 | Durable replay, concurrency/version primitives, audit, company/rate setup and partner provisioning; company scope enforced on reads and writes | C |
| M3 — Driver onboarding and files | M1/M2 scope and replay; DEC-02/06/07/08/09 | Driver entry, directory, contextual private uploads/scanning and initial activation; denied/unclean file cases proven | D |
| M4 — Orders and dispatch reads | M2/M3; DEC-04/05/20 | Partner/admin intake, accept/reject, one unassigned trip per acceptance, outbox worker and scoped trip reads; admin Orders integrates with real API | O |
| M5 — Complete one trip | M2–M4; DEC-04/11/12/13/14/15 | Assign → start → expenses/confirmation → partner code reveal → close; one immutable payroll/report/credit, including concurrent/lost-response cases | T |
| M6 — Monthly statements | M5; DEC-16/17/18 | Completed-month statements, frozen content/version, explicit creator-plus-other approval and scoped publication | S |
| M7 — Agreed extensions | Relevant core milestone and scope decision | Calendar, estimates, reporting, selfies/history or P2 changes delivered with their own acceptance evidence | X |
| M8 — Pilot readiness | All P0 milestones; selected extension/infrastructure scope | Real clients, managed services, security, load and restore exercises satisfy the release gate | R |

Staging setup, provider evaluation, contract decisions and test-fixture preparation can progress alongside the feature sequence. Do not wait until M8 to investigate provider or mobile compatibility. Concurrency tests belong in the milestone introducing the write, not in a final testing phase.

## Milestone detail

### M0 — Make the foundation reviewable

Review and commit the existing foundation, validate a clean checkout with the pinned runtime, run the configured GitHub workflow and obtain teammate review before merge. Preserve the first migration; later schema changes use new migrations. Existing local evidence covers only the implemented foundation portions of QA-26/27/31.

### M1 — First real admin login

Implemented admin policy on 17 October 2026: the owner selected persistent browser sign-in through an HttpOnly refresh cookie, with access tokens kept in memory. [Authentication policy](authentication.md) records Argon2id settings, normalized email, operator bootstrap, session-bound JWTs, bounded lifetimes, guarded cookie/CSRF/CORS behavior, atomic rotation/reuse revocation and PostgreSQL abuse limits. Native JSON refresh transport remains available for contract compatibility; partner identity scope is now implemented from current membership; driver profile scope is now implemented; actual Flutter validation remains M3. The owner selected mandatory first-login change for provisioned partners; its API/restriction/session revocation are implemented. Admin provisioning and its consumer flow are now implemented in C10; see [account policy](accounts.md).

Build the operational first-admin command with no committed/shared password or public admin registration. Implement session-bound access checks, atomic refresh rotation/reuse handling, logout, session listing/revocation, current identity and disabled-account rejection. Add a second synthetic admin for future statement tests. Administrative account creation/status endpoints follow in M2 because their contracts require durable idempotency. Scope the first client integration to admin authentication; partner memberships and driver eligibility become real in M2/M3.

Acceptance: valid login and current-admin verification succeed; invalid, disabled, expired, revoked and replayed refresh credentials fail correctly. Passwords/raw tokens stay out of persistent logs and responses except the selected issuance transport. Verify the admin browser session lifecycle without intercepting auth requests. Overview data may remain unavailable until its resource endpoints land. Evidence: QA-01/02/23 and affected account cases.

### M2 — Companies with reliable mutations

The merged command foundation implements C01–C04 under DEC-05/GAP-05; consume its replay/transaction boundary for company/account commands, while later order/trip modules own aggregate versions. Define actor/operation/resource scoping, request fingerprints, in-progress/uncertain outcomes, replay retention and error handling. Resolve committed replay before stale-version preconditions while always rechecking current authorization. Do not apply idempotency/version headers to routes that do not declare them.

Implement companies, partner memberships, payout-rate history and audit with reviewed integrity SQL. Company plus initial rate and partner user plus membership must each commit atomically. Implement strict DTOs, scoped totals, deterministic opaque cursors and exact monetary serialization. Protect admin-only operations and own-company partner reads; decide account/company-disable behavior and rate interval policy first.

Use the same durable command mechanism for admin account creation/status APIs, including the last-active-admin safeguard and session revocation on disable. Operational bootstrap is not a substitute for these authenticated account-management endpoints.

Acceptance: the admin Companies UI uses real list/create/detail/provisioning APIs; duplicates/retries cannot create a second company or account; two synthetic companies prove isolation. Rate writes preserve non-overlapping effective intervals and historical records. Evidence: QA-02/05/13/21/31.

### M3 — Drivers and private files

The owner selected admin-only driver provisioning with required first-login password change; this profile/auth/read/admin-client slice is implemented in [driver policy](drivers.md). The owner selected [SeaweedFS Community Edition in Docker](../docs/local-object-storage.md) for local storage. The owner also selected local ClamAV, PDF/JPEG/PNG up to 5 MiB and five-minute download links on 18 October. Upload/scan/metadata and durable recovery are now implemented in [file policy](files.md); attachment, link issuance and initial activation are now implemented locally in [document policy](documents.md). Production storage/scanner providers and cleanup/retention remain open; the owner selected four-current-clean-document activation on 18 October. Driver entry and initial activation now enforce the selected policy, with driver profiles, upload purpose/owner/context persistence, quarantine/scan state and current-document integrity. Use a replaceable storage/scanner boundary with deterministic synthetic test outcomes; select and verify the real provider before real-file integration.

Support the existing directory/detail/current-document/private-preview/activation clients. Download issuance reauthorizes the current attachment, type and clean scan. Pending/rejected content stays unavailable. Activation rechecks the enabled account and approved document gate atomically; viewing a document does not formally verify identity. Preserve first activation history.

Acceptance: pending driver uploads → clean scan → attachment → admin private preview → initial activation works; swapped IDs, pending scans, missing contextual ownership and disabled accounts fail safely. Test actual signed-file transport/CORS with synthetic content before claiming storage integration. Evidence: QA-02/03/08/23/24/31.

The admin directory already requests selected-day calendar snapshots. Either explicitly select the underlying availability capability early (X01), or keep the frontend's unavailable-calendar state visible until it is delivered. Do not return fabricated empty availability or infer it from online status.

### M4 — Orders and the outbox

Implement strict admin/partner intake, company-derived scope, list/detail filters and admin decisions. Order acceptance commits its trip, protected close-code material, audit and required email intents together. Rejection commits its decision and required email intent together. A repeated command returns the original result; opposing decisions cannot both succeed.

Build the separate outbox worker with durable leases, bounded retries and sanitized delivery status. Resolve recipient/provider policy under DEC-20. Synthetic tests use a local capture/fake transport; no customer email. A provider outage must not undo acceptance/rejection. Preserve the distinction between one durable intent and potentially repeated provider delivery.

Provide scoped trip list/detail/assignment reads for the accepted-order handoff. Integrate the admin Orders flow and partner intake. Operations Overview reuses resource lists and server totals: verify Orders/Trips tiles as their endpoints land; its Statements tile becomes real in M6. Do not invent a new overview endpoint or return false zero counts.

Acceptance: two concurrent decisions yield one terminal decision and at most one trip; response loss and worker failure recover safely. Evidence: QA-02/05/06/19/21/31. Close-code policy is a dependency of acceptance because acceptance creates protected code material, even though reveal/validation are used in M5.

### M5 — One complete trip and immutable earnings

Implement admin assignment/reassignment, active-driver eligibility, start, own expenses and explicit complete-list/empty confirmation. Reassignment and expense changes invalidate confirmation and advance the trip version. Former drivers lose operational write access. Selfie collection remains P1 and must not become a mandatory start gate without a policy decision.

Implement partner-only code reveal and driver-entered closure with protected validation material, separate encrypted reveal data and durable abuse counters. A failed financial transaction must not erase wrong-code attempts. No ordinary response, email, audit or log exposes the code.

Coordinate closure in one PostgreSQL transaction: lock company then trip, verify current state/assignment/confirmation/code, read the closure-effective rate, calculate exact shares and persist trip/assignment/payroll/report/one wallet credit/audit and any required outbox effects. Freeze and validate the version-1 report against its canonical schema. Permanent uniqueness protects closure even after replay-registry expiry; services must share the same transaction context.

Acceptance: real partner/admin/driver clients complete a synthetic trip; concurrent closure and rate/reassignment/expense races preserve one result. Inject failures before and after commit, then retry. Closed records stay immutable; earnings totals reconcile with credits and respect ownership. Evidence: QA-08–15/21/23/31.

### M6 — Statements and publication

Agree month basis and partner visibility first. Generate one company/month draft from immutable closed-trip payroll using Asia/Kolkata month boundaries and exclusive period ends. Implement creator-only draft regeneration, submission/content freezing, explicit creator approval plus exactly one distinct other admin approval on the same contentVersion, then publication with its outbox intent.

Acceptance: duplicate generation/publication, concurrent approvals, noncreator pairs, third approvers and stale versions cannot bypass the lifecycle. Partners read only their authorized statements under the agreed visibility policy. Email failure does not reverse publication. No unapproved revision, void or creator-unavailability bypass is added. Evidence: QA-16–19/21/31.

### M7 — Explicit extension lane

Track these separately from the P0 gate: driver availability writes (P1), rough duration/overrides and later maps integration (P1), selfies (P1), completed-driver history (P1), seven admin reports (P1), and profile/document replacement (P2). Early work needed by P0 screens needs a recorded scope decision. Existing draft acceptance/publication email behavior is not silently deferred with optional notifications.

For estimates, resolve DEC-32 and keep speed/policy server-controlled; missing policy yields unavailable, and history never recalculates silently. For reports, settle DEC-19/24 denominators/date bases/export limits before publishing metrics. Do not include GPS, driver accept/reject, formal identity verification, in-app withdrawals or speculative financial adjustment endpoints.

### M8 — Evidence for a pilot

Integrate the actual admin, partner and Android clients; replace intercepted business responses in dedicated live integration suites while retaining useful fast mock regressions. Verify synthetic managed PostgreSQL/storage/email and the agreed Redis cache role, TLS, connection budgets, expiry/invalidation and outage fallback. Add sanitized audit/diagnostic visibility and operational alerts.

Select DEC-23 workload/latency/error/duration criteria before running the agreed 1,000-account/100-active-user exercise. Record owners, retention, key/backup custody, restore targets and a successful isolated restore. Validate migration upgrades on populated prior schemas, application rollback compatibility and the full partner → admin → driver → statement journey. Follow the [release gate](../docs/deployment-guide.md#7-first-productionpilot-gate); a green local build is not pilot sign-off. Evidence: QA-22–24/26–32 plus every P0 workflow case.

## Decision gates

| Before | Resolve or explicitly scope | Contract impact |
| --- | --- | --- |
| M1 auth | DEC-03, account parts of DEC-10; DEC-30 if critical Redis roles are chosen | Token transport, rotation/lifetimes, password/first-login API, bootstrap, disable and abuse limits |
| M2 mutations/rates | DEC-05, company parts of DEC-10, DEC-13; GAP-05 | Replay persistence/versioning, disable behavior, rates/history and audit |
| M3 onboarding/files | DEC-02/06/07/08/09; DEC-22 before real personal data | Driver entry, contextual uploads, scanning, signed access/cleanup, activation gate |
| M4 decisions/email | DEC-04/20 plus required DEC-05 behavior | Code material created on acceptance; recipients, retries, provider idempotency |
| M5 execution/money | DEC-04/11/12/13/14/15 | Code abuse, zero price, expenses, rounding, reassignment and optional selfie |
| M6 statements | DEC-16/17; keep DEC-18 exceptions out unless agreed | Month basis, visibility, approval/version and exception policy |
| M7 extensions | DEC-19/24/32; GAP-03/04/08 | Metrics/exports, P1 scope, estimate evidence and client filters |
| M8 pilot | DEC-02/22/23/25/30 | Providers, retention/restore, acceptance limits, owners and cache policy |

These are decision tasks, not a blanket approval pause. Resolve routine technical choices using the selected architecture and version policy. Product/security ambiguities require the relevant decision record before dependent code; unrelated work can continue.

## Definition of done for each slice

1. Intended behavior and affected DEC/GAP items are recorded; API/schema/client contracts agree.
2. Strict request/response mapping, account/role/resource checks and scoped rows/totals are implemented.
3. New migrations preserve DBML mappings/custom integrity and pass blank plus populated prior-schema upgrades where applicable.
4. Build/typecheck/lint and relevant real PostgreSQL tests pass; concurrency/replay/failure tests accompany affected writes.
5. The affected client completes the live workflow, including denied access and recoverable failure. State mock-only limitations explicitly.
6. Setup, examples, checklist status, QA evidence and operational implications are current.
7. Independent review and required CI pass; the repository admin merges the PR into `development`.

## Immediate next work

The current local slice implements document persistence/attachment/listing, encrypted full-number retention, five-minute authorized downloads and initial activation under the selected four-clean-document/enabled-account rule. Document access merged in [PR #20](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/20) at `ba87d29`; review the [document policy](documents.md), renewed evidence and outstanding CI/independent review gates. Cleanup, real-data/key/backup retention, Flutter integration and calendar scope remain M3 follow-ups. M4 orders/trip handoff/email outbox follows after close-code and email policy choices; do not invent code/recipient behavior. Full account-management remains client work. Partner authentication/company screens are integrated and verified; order/trip/report/statement screens await their M4–M6 services.
