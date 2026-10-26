# Decision log

**Reviewed:** 10 October 2026. This register distinguishes the project owner's selected direction from open policy and implementation choices. It is not evidence of completed implementation or independent PR review.

Use it to resolve the open choices already described in [PRD validation](database/prd-validation.md), [workflows](workflows.md) and the [API guide](api/README.md). A proposed default is not a confirmed requirement.

## 1. Existing baseline

The existing project contracts establish three application roles, one company scope per partner in the working design, admin-controlled assignment, partner-revealed/driver-entered close codes, recorded earnings on closure, and explicit creator-plus-other-admin statement approval. Driver accept/reject, GPS tracking, formal document verification and in-app withdrawals are outside Phase 1.

Preserve the existing DBML and version-1 report JSON names. Resolve disagreements openly; this register does not silently replace those contracts or convert proposals into approved policy.

## 2. Open decisions

Every item in this section is **Open**. The suggested participants are review responsibilities, not assigned people or approvals. Decide each item before implementing or deploying the feature it affects; independent work may continue.

| ID | Decision | Current proposal or unresolved point | Needed before / participants |
| --- | --- | --- | --- |
| DEC-01 | Toolchain and code layout | Backend foundation now pins Node 26.11.1, pnpm 12.14.0, Express 5.3.0, Prisma 7.10.1, PostgreSQL 18.6 and TypeScript 6.0.3 (ESLint compatibility exception); layout, lifecycle and release evidence are in the [backend README](../backend/README.md). Remaining application/provider choices stay scoped to their feature | Backend foundation implemented; full-stack + Flutter for remaining choices |
| DEC-02 | Service/provider choices | Managed PostgreSQL selected; owner selected SeaweedFS Community Edition in Docker for local object storage on 17 October 2026. See [local setup](local-object-storage.md). Cloudflare R2 remains a production recommendation; owner selected ClamAV in Docker for local scanning on 18 October 2026. Deployed database/Redis/storage/scanner/email providers remain open. External routing is deferred initially under DEC-31; choose a maps provider only when integrating it | Infrastructure integration; full-stack + admin |
| DEC-03 | Authentication and account lifecycle | Owner-selected persistent HttpOnly browser refresh cookie implemented for admins. Baseline: Argon2id, normalized email, session-bound HS256 access JWTs, 15-minute access/seven-day absolute refresh defaults, durable reuse detection, explicit origin/custom-header CSRF and operational password bootstrap. See [policy/evidence](../backend/authentication.md). Owner selected mandatory first-login password change for provisioned partners: restricted sessions, verified password change, all-session revocation and fresh sign-in now implemented with membership-derived scope. Admin provisioning/status and its first-login password-change screen are now implemented. Driver provisioning, real profile scope and required password-change API lifecycle are implemented under the owner-selected admin-only entry policy; partner portal screens, driver Flutter screens, recovery policy and independent security review remain open | Admin implementation; full-stack + Flutter + tester for remaining lifecycle and review |
| DEC-04 | Close-code policy and keys | Accepted 22 October 2026; see M4 policy selection below. Acceptance creates protected material; M5 implements reveal/attempts/closure. | OTP implementation; full-stack + tester |
| DEC-05 | Durable retries and versions | Internal foundation implemented: PostgreSQL actor/method/path/key registry, keyed normalized fingerprints, 25-hour retention, transaction-scoped duplicate exclusion, current authorization before replay, explicit safe-denial results, aggregate ETag helpers and atomic append-only audit. See [policy](../backend/commands.md). Business consumers, close-code attempt accounting and independent review remain open | Command foundation and consuming mutations; full-stack + Flutter + tester |
| DEC-06 | Remaining upload purposes | Owner selected PDF/JPEG/PNG up to **5 MiB** for driver documents on 18 October 2026; implemented with persisted driver/uploader/purpose, signature inspection and mandatory ClamAV scanning. Trip selfies/receipts remain unimplemented and their enforcement requires the trip/assignment modules | Remaining trip-media implementation; full-stack + Flutter + tester |
| DEC-07 | Cleanup and replacement retention | Owner selected **five-minute signed download links** on 18 October 2026; issuance is implemented locally with clean current attachments, fresh authorization and access audit. Cleanup of abandoned uploads and replacement retention remain open; no automatic deletion is implemented | Downloads/real-file use; full-stack + tester |
| DEC-10 | Account/company disable behavior | Company deactivation preserves history; future intake must check its flag under the company lock. Owner selected protecting the final enabled admin with completed password setup; C10 now implements this, serialized account status changes and immediate all-session revocation on disable. Intake/execution integration remains pending. See [account](../backend/accounts.md) and [company policy](../backend/companies.md) | Company baseline and remaining account/intake mutations; team |
| DEC-11 | Price boundary | Existing design permits zero trip amount/credit; confirm allowed business usage | Pricing/closure implementation; team |
| DEC-12 | Expense completion/reimbursement | Positive entries, optional category/receipt, explicit empty confirmation and exclusion from split are working rules; reimbursement is unspecified | Expenses/closure implementation; team |
| DEC-13 | Rate timing and rounding | Company slice implements immediate audited half-open rate intervals under company-first locking, database-chosen effective instants and exact positive splits summing to 100.00. No client scheduling/backdating; see [policy](../backend/companies.md). Closure-effective selection, payroll rounding and independent review remain pending | Company rates and later payroll implementation; full-stack + team |
| DEC-14 | Reassignment and contribution | Pre-close only, preserve start/expenses, revoke old writes; whole share to closing driver proposed | Assignment/closure implementation; team + Flutter |
| DEC-15 | Selfie gate | Selfie is P1; mandatory-before-start is unresolved; draft start does not require it | Trip UI/API integration; team + Flutter |
| DEC-16 | Monthly statement basis | Manual generation, completed months, actual closure in Asia/Kolkata proposed | Statement implementation; team |
| DEC-17 | Partner statement access | Draft requires publication as well as verification; clarify PRD wording | Statement read/publication; team |
| DEC-18 | Submitted statement exceptions | Revision, creator unavailable, disputes and void are unspecified; no bypass endpoint in draft | Any exception workflow; team + admin |
| DEC-19 | Reports and exports | Agree delay/success denominators, grace, date bases, live refresh meaning and supported export formats | Reporting implementation; team |
| DEC-20 | Email operations | Accepted 22 October 2026; company contact snapshot, bounded durable retries and local capture. Production email provider remains deferred; see M4 policy selection. | Required email transitions; full-stack + team |
| DEC-21 | Additional notifications and rollout | Email only in current draft; push/SMS/in-app not agreed. Rejection email stays part of P0 decision flow | Notification expansion; team |
| DEC-22 | Retention and recovery | Set personal-data/log/backup retention, recovery-point/time targets, backup custody and key recovery | Real-data staging/pilot; admin + tester + operational owner |
| DEC-23 | Device/performance targets | Capacity scope accepted under DEC-35; choose supported Android baseline, low-bandwidth scenarios, workload mix, latency/error limits, load duration and alert thresholds | Performance/device acceptance; full-stack + Flutter |
| DEC-24 | Large results and downloads | Decide limits for complete expense/statement details, generated exports and frozen pagination semantics | Large-data/exports implementation; full-stack + Flutter |
| DEC-25 | Release operations | Name release/incident/backup owners, choose staging/pilot access and record release acceptance/sign-off | Shared staging and launch; admin + team |
| DEC-30 | Redis operating policy | Select initial cache data, keys, expiry/invalidation, client/version, memory/eviction, timeouts and capacity; decide any session/limiter/queue role and its isolation, persistence, recovery and failure policy | Redis integration; full-stack + Flutter where affected + tester |
| DEC-32 | Estimate policy and future routing | Agree calibrated average speed, distance/duration bounds and policy version; later choose provider order, normalized traffic/travel basis, provenance, deadlines, quotas and storage terms | Heuristic acceptance / later provider integration; full-stack + Flutter + team |

Check [integration gaps](requirements-traceability.md#4-integration-gaps) alongside this table. Decisions about API behavior require matching changes to OpenAPI, clients, tests and relevant database contracts. A decision in prose alone does not implement a feature.

## 3. Selected architecture decisions

These choices are **Accepted as project-owner direction**, recorded from the owner's planning discussion and documentation-update request on 10 October 2026. Implementation PRs still require the normal independent review and checks. No provider, queue library or authentication transport was selected in that discussion.

| ID | Decision | Choice and reason | Implementation impact |
| --- | --- | --- | --- |
| DEC-09 | Initial driver activation | Owner selected an enabled account and all four current clean documents on 18 October 2026: driving licence, Aadhaar, PAN and PCC | Atomic service/database gate, reason/audit/replay and immutable first activation identity; no admin override or formal identity verification |
| DEC-38 | Driver document numbers | Owner selected retention of full encrypted numbers on 18 October 2026 | Context-bound AES-256-GCM with independent key/key ID and masked ordinary reads; no plaintext numbers in logs/audit/replay. Real-data retention/recovery remains DEC-22 |
| DEC-26 | Backend architecture | Modular Express monolith for simpler deployment and maintenance | Business modules with service boundaries; one PostgreSQL transaction across closure services |
| DEC-27 | Container strategy | Docker for development and web/backend deployment | Compose development stack; production images/configuration; Flutter runs on device/emulator |
| DEC-28 | Database hosting | Managed PostgreSQL for deployed staging/production; Docker PostgreSQL for local development/tests | Select provider/plan/region, connection budgets, TLS, migrations and tested recovery |
| DEC-29 | Redis adoption | Include Redis for targeted caching; session management remains an option | Scope/invalidate cached reads; keep financial state/outbox/replay durable in PostgreSQL; settle DEC-03/30 before extra roles |
| DEC-31 | Initial travel-time estimate | Start with manually supplied road distance and server-configured speed, clearly labelled as rough, plus admin override; no external routing provider initially | Draft API/DB/report contracts add heuristic source/evidence; keep PRD B-04 maps integration tracked as later P1 work; no automatic heuristic-based penalties |
| DEC-33 | Backend language | TypeScript for the Express modular monolith | Typed service/repository boundaries and build/type checks; runtime validation and authorization remain required; versions/layout stay DEC-01 |
| DEC-34 | Data access and migrations | Prisma ORM with PostgreSQL | Repositories use Prisma; pass one transaction context across closure services; preserve DB names/contracts and reviewed SQL invariants; pin version-compatible generation/migrations under DEC-01 |
| DEC-35 | Capacity scope | 1,000 registered accounts and 100 simultaneous active users | Validate representative workload before claiming capacity; latency/error thresholds and duration stay DEC-23. A 200-user stress run is proposed headroom only |
| DEC-36 | Node.js package manager | pnpm for Node.js projects, confirmed by the owner on 10 October 2026 | Use pnpm installs/scripts/local binaries and one pnpm lockfile per agreed install boundary; Node remains runtime and Flutter keeps its own tooling. Versions/bootstrap and workspace topology stay DEC-01 |
| DEC-37 | Dependency/version policy | Use the newest generally available stable compatible release when adopting packages, software/libraries or third-party tools, confirmed on 10 October 2026 | Verify official release/support information and project compatibility; pin tested versions and preserve reproducible locks. Document concrete reasons for any supported older version; intentional tested updates, no automatic mass upgrade |

Driver-file direction selected by the owner on 18 October 2026: **PDF/JPEG/PNG, maximum 5 MiB per driver document; ClamAV in Docker with a clean scan required before attachment/download; five-minute signed download links.** [Private-file policy](../backend/files.md) records the implemented upload/metadata workflow, local scanner and recovery evidence. Attachment, download issuance and initial activation are implemented locally in [document policy](../backend/documents.md); cleanup/retention remains open. This selection does not approve a production scanner provider or real-data retention.

Driver entry is an additional owner-selected feature policy, accepted 18 October 2026:

| ID | Decision | Choice and reason | Implementation impact |
| --- | --- | --- | --- |
| DEC-08 | Driver entry mechanism | Admin-only provisioning with an initial password and mandatory first-login change; selected explicitly by the owner | POST /drivers and the admin creation UI create pending/offline restricted accounts; public applications return 403. No email invitation service. [Driver policy](../backend/drivers.md) records implementation and remaining Flutter/file gates. |

Affected guides: [architecture](system-architecture.md), [infrastructure](infrastructure-plan.md), [estimation](travel-time-estimation.md), [setup](developer-setup.md), [security](security-design.md), [testing](testing-strategy.md), [deployment](deployment-guide.md) and [operations](operations-runbook.md). DEC-26 through DEC-29 and DEC-33 through DEC-37 leave payloads unchanged. DEC-31 expands the draft API/DB/report estimate contract without changing PRD priorities; it does not complete the maps-based requirement. Later auth/queue/provider changes require coordinated contract review.

DEC-37 is the reusable policy in [developer setup](developer-setup.md#dependency-and-version-policy). It does not choose all pending versions now or upgrade existing dependencies as part of documentation alignment.

Prisma ORM is [free and open source](https://www.prisma.io/orm). Optional Prisma-hosted database/services are separate products and are not selected by DEC-34; managed PostgreSQL provider/plan remains DEC-02.

## 4. How to record a decision

1. Open a task or PR linked to the decision ID.
2. State the concrete choice, alternatives considered and reason.
3. Identify affected contracts, migration/client impact and tests.
4. Obtain the relevant team review. Security choices include the penetration tester; shared mobile/API choices include Flutter.
5. Update this register with date, decision, reviewer evidence and status. Preserve earlier rationale when replacing a choice.

Use statuses **Open**, **Accepted**, **Deferred** or **Superseded**. Deferred means the feature is explicitly out of the current delivery scope, not that an unresolved safety/correctness rule can be ignored.

## 5. Decision record template

```text
Decision ID:
Status:
Decision date:
Choice and reason:
Alternatives considered:
Affected documents/API/schema/clients:
Implementation and migration work:
Tests and acceptance evidence:
Reviewers and PR/task link:
Replaces / replaced by:
```

Do not mark an item accepted merely because a prototype or draft endpoint already follows that choice. Product approval, implementation and validation are separate events.

## M4 policy selection — 22 October 2026

The project owner explicitly selected these policies in the Orders implementation chat.

- **DEC-04 Accepted:** uniformly random six-digit code, AES-256-GCM at rest with a dedicated versioned key ring and trip-bound authenticated context. Store a separate keyed HMAC for future constant-time validation. No scheduled expiry/replacement; valid until closure. Five invalid submissions lock for 15 minutes. Acceptance creates material only; partner reveal and driver attempt/closure enforcement follow in M5. Retain previous keys until affected trips close; missing keys fail closed. Never emit code material in reads, email, replay or audit.
- **DEC-20 Accepted:** one acceptance/rejection intent to the company contact email captured at the transition. Notification userId identifies the initiating admin, not the recipient. Missing/invalid recipient produces an explicit failed intent without rolling back the order. Five delivery attempts; delays after failure are 1, 5, 15 and 60 minutes. Reclaim an expired 60-second lease with a fresh fencing token; stale acknowledgements cannot mutate delivery state. Admin may explicitly retry a failed intent (same recipient snapshot; bounded new attempt cycle). Local capture transport only for development/tests; it must never send customer email. A production provider is deferred and startup must reject capture in production. Transport idempotency uses the immutable notification ID; a provider that cannot enforce it may deliver duplicates after a crash and must document that limitation.

The notification recipient schema now permits null for a missing-recipient failed intent. Scalar foreign keys/custom checks are reviewed SQL where Prisma does not model a cross-domain relation. M4 adds resource versions, a code key ID/lock timestamp, millisecond cursor anchors and a minimal assignment-history table; M5 owns execution/financial models and transitions.

## Live trip and statement policy selection — 22 October 2026

The project owner explicitly accepted the documented proposals in the live portal implementation chat. DEC-11/12/13/14/15: zero-price trips and zero credits are allowed; positive expenses are reporting-only and excluded from payouts; empty expenses require explicit confirmation; use the rate effective at server closure, calculate driver paise half-up and give company the exact remainder. Pre-close reassignment preserves start/expenses, invalidates confirmation and revokes former-driver operational access; the closing driver receives the whole share. Selfies remain optional P1 work. DEC-16/17: manually generate completed Asia/Kolkata closure-month statements; creator-only draft regeneration, frozen submission, explicit creator plus distinct second-admin approvals and published-only partner visibility. Submitted revision/void/creator bypass and production payment processing remain outside scope. DEC-04/20 selections remain unchanged.

## Business-client session policy — 22 October 2026

The owner requested a 24-hour business-client session timeout (CHG-001 in the [change list](change-list.md)). Partner sessions now have an absolute 24-hour lifetime from sign-in; refresh never extends that deadline. Short-lived access tokens renew within that window, including after backgrounding. Existing partner sessions are capped to creation plus 24 hours; admin/driver session policy is unchanged. Logout, disabled accounts and password changes may revoke access sooner.
