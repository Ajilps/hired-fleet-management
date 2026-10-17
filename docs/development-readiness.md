# Development readiness

**Reviewed:** 10 October 2026; implementation status updated 17 October 2026. Start here before implementing HireD Phase 1.

The repository contains application/database/API plans, a runnable API documentation site and application code. The admin portal implements mocked API workflows. The [backend foundation](../backend/README.md) now provides infrastructure probes and two identity-table migrations; authentication, business APIs and production infrastructure remain pending. Read each application README for its current implementation and verification scope.

| State | Current position |
| --- | --- |
| Selected | TypeScript/Prisma Express backend with pnpm for Node packages; PostgreSQL authority, local Docker and managed deployed database; Redis targeted caching; React portals and Flutter mobile; newest stable compatible dependency policy (DEC-37); 1,000 accounts/100 active users |
| Pending | Application toolchain/pnpm versions, bootstrap, install/workspace boundaries and scripts, provider/plan, pool limits, optional Redis authority/queue roles and workload latency/error/duration criteria; DEC-01/02/23/30 |
| Implemented | Design/contracts, API docs and admin frontend workflows; runnable backend foundation with mapped users/sessions models, migration history, HTTP/PostgreSQL tests and CI configuration. No working backend authentication or business endpoints yet |

## 1. Read in this order

| Order | Document | Use it to |
| --- | --- | --- |
| 1 | [Application workflows](workflows.md) | Understand the order-to-trip, earnings and statement journeys |
| 2 | [Requirements traceability](requirements-traceability.md) | Find PRD priorities, screen/API mappings, planned tests and integration gaps |
| 3 | [System architecture](system-architecture.md) | Understand application boundaries and transaction responsibilities |
| 4 | [Developer setup](developer-setup.md) | Run documentation today and prepare reproducible app setup |
| 5 | [Security design](security-design.md) | Apply role/resource scope, private files, session and close-code controls |
| 6 | [Testing strategy](testing-strategy.md) | Select meaningful acceptance, concurrency and recovery checks |
| 7 | [Decision log](decision-log.md) | Resolve choices before implementing the affected features |
| 8 | [Deployment guide](deployment-guide.md) | Prepare environments, migrations, releases and rollback |
| 9 | [Operations runbook](operations-runbook.md) | Prepare monitoring, incident response, backups and restoration |
| 10 | [User guide](user-guide.md) | Explain the proposed flows to admins, business partners and drivers |

Read the [Docker, Redis and managed database plan](infrastructure-plan.md) immediately after architecture when setting up infrastructure. It explains selected directions, failure boundaries and remaining configuration choices.

Read [travel-time estimation](travel-time-estimation.md) when building intake/tracking. The first version uses supplied road kilometres and a server speed policy with clear rough-estimate labels; Google Maps is not required initially. Maps-based B-04 remains later P1 work.

Keep [naming conventions](naming-conventions.md) and [Git rules](git-workflow.md) open while contributing. Use [API documentation](api/README.md), [OpenAPI](api/openapi.yaml), [database design](database/database-design.md), [DBML](database/hired.dbml) and [index/integrity rules](database/indexing-strategy.md) for detailed contracts.

## 2. Which source answers which question?

| Question | Source |
| --- | --- |
| What is in scope and how important is it? | Pinned PRD in [traceability](requirements-traceability.md) |
| What journey should users follow? | Workflows and UI specification |
| What does a client send/receive? | OpenAPI and endpoint reference |
| What is stored and what must remain consistent? | DBML, database design, indexing rules and report JSON schema |
| Which choices are selected or still open? | PRD validation and decision log; setup/database guides for TypeScript/Prisma and infrastructure plan for Docker/Redis/managed PostgreSQL |
| How do we contribute and review? | Git workflow and naming conventions |

When sources disagree, record the discrepancy and resolve it with the relevant reviewers. Update contracts, clients and tests together. An implementation shortcut or a prose decision does not silently override an existing contract.

The UI specification/design assets are on the separate `docs/ui-ux-specification` branch. [GAP-02](requirements-traceability.md#4-integration-gaps) records their integration. Use its reviewed PR through `development`; this documentation change does not merge or duplicate those assets.

## 3. Before the first application slice

The following tasks are **pending**. Agree feature-specific choices before their dependent implementation; unrelated work can proceed.

- [ ] Pin compatible Node.js/TypeScript/Prisma/pnpm/PostgreSQL versions, bootstrap and install/workspace boundaries, layout, generation/migration/seed scripts, test tools and provider adapters: DEC-01/02; TypeScript/Prisma/pnpm are already selected under DEC-33/34/36.
- [ ] Implement the selected container/database direction: DEC-26 through DEC-29; decide Redis limits/roles under DEC-30.
- [ ] Set authentication, account-entry and password-change behavior: DEC-03/08 and GAP-01/06.
- [ ] Design durable retries, aggregate versions and upload context: DEC-05/06 and GAP-05.
- [ ] Agree OTP protection, file access and onboarding gates: DEC-04/07/09.
- [ ] Resolve money, expense and reassignment rules before financial writes: DEC-11 through DEC-14.
- [ ] Agree heuristic speed/limits/policy under DEC-32 and update affected UI/ERD references under GAP-08; DEC-31 selects the initial approach, not a default speed.
- [ ] Assign implementation/review owners and record the first slice's QA cases.
- [ ] Record official stable-release/support evidence and project validation for adopted versions under DEC-37; document any supported older-version compatibility/stability exception. Existing docs conversion is not a mass upgrade.
- [ ] Add real environment templates, explicitly mapped Prisma models, reviewed migrations/custom SQL, generation/build checks, synthetic seeds and startup commands with the scaffold.
- [ ] Define DEC-23 workload/latency/error/duration criteria and validate the selected 1,000-account/100-active-user target (DEC-35); QA-31/32 remain planned.

See all decision IDs in the [decision log](decision-log.md). UI filter/export mismatches and PRD priority differences are also tracked in [integration gaps](requirements-traceability.md#4-integration-gaps).

## 4. Suggested implementation sequence

Each step should produce a reviewable, tested result rather than an entire unfinished layer. Follow PRD priority and explicitly agree any P1 capability delivered early to support P0.

1. **Foundation:** TypeScript/Express/Prisma modular-monolith scaffolds, Docker development stack, authentication, company scope, migrations, private upload lifecycle and synthetic fixtures. Prove denied access as well as successful login. Configure managed staging PostgreSQL with reviewed TLS/pooling and add only explicitly scoped Redis caches; validate their isolation and outage fallback.
2. **Onboarding and intake:** operational driver activation, company/rates, partner/admin order entry and transactional decision emails. If adding the initial rough estimate, follow the revised distance/source/evidence contracts and QA-07 without a maps dependency.
3. **One complete trip:** assignment, start, positive expenses/empty confirmation, partner code reveal, atomic closure, frozen report and one earnings credit. Test a lost response and concurrent closure before expanding screens.
4. **Monthly statements:** draft/versioning, submission, explicit creator-plus-other approval, publication and partner access. Resolve DEC-16/17 first.
5. **Remaining acceptance and polish:** finish every P0 row, responsive/low-bandwidth behavior, security and recovery evidence; deliver agreed P1/P2 work separately with its own acceptance cases.

Availability is P1 as a driver interaction, while the P0 admin directory uses availability data. Coordinate the underlying capability explicitly rather than changing the PRD's priority labels. Reporting, estimates, selfies and completed-history screens also need deliberate P1 planning.

## 5. Responsibilities

| Team responsibility | Expected contribution |
| --- | --- |
| Three full-stack developers | Divide backend/React/data work; independently review one another's changes |
| Flutter developer | Android implementation and shared API/mobile review |
| Penetration tester | Security review and evidence for auth, OTP, uploads and access boundaries |
| Repository admin | Protected-branch merges and release coordination, potentially alongside a contributor role |

Name feature, release, incident and backup owners in tasks/release records; this guide does not assign people. Never count an author's own approval as independent review.

## 6. What counts as ready?

**Ready to implement a feature:** relevant choices are resolved, contracts agree, ownership is clear and acceptance cases are selected.

**Ready to merge a feature:** implementation and applicable checks pass, affected docs/contracts are current, independent review is complete and the admin follows the PR process.

**Ready for production/pilot:** all P0 requirements have implementation/test evidence, the release gate in [deployment](deployment-guide.md#7-first-productionpilot-gate) is met, and security/restore results are recorded. P1/P2 delivery scope is explicit.

Infrastructure acceptance also needs QA-27 through QA-30; Prisma migrations/mappings and capacity validation need QA-31/32. A running container, a managed provider account or a warm cache is not proof of correct closure, access control or recovery.

Update the traceability rows with implementation PRs and evidence as work lands. Keep unimplemented work and unresolved decisions visible; documentation coverage alone is not launch readiness.

## 7. Terms used in these guides

| Term | Plain meaning |
| --- | --- |
| Contract | Agreed shape/rules for data or behavior; a draft still needs review |
| Transaction / atomic | Related database changes succeed together or are all rolled back |
| Idempotency / replay | Retrying the same action returns its saved result without doing it twice |
| ETag / version | A value that lets the server detect edits made since the client last read a record |
| Immutable / frozen | A saved historical result that later edits must not rewrite |
| Outbox / email intent | A database record of an email to send after the business action commits |
| DTO | The allowed input/output fields for an API operation |
| Migration | A versioned change to database structure or existing data |
| P0 / P1 / P2 | PRD delivery priorities; P0 is required for Phase 1 acceptance |
