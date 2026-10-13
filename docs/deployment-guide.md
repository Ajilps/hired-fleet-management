# Deployment and release guide

**Status:** preparation guide, updated 10 October 2026. TypeScript/Prisma for the Express backend, Docker deployment, Redis caching and managed PostgreSQL are selected directions. No application build, Dockerfile/Compose configuration, CI pipeline, hosting environment or deployment command exists in this repository yet.

Use this guide when adding infrastructure and preparing a release. Follow the [Git workflow](git-workflow.md) for branches, review and merges. Recovery procedures belong in the [operations runbook](operations-runbook.md).

## 1. Environments

| Environment | Purpose | Data and access |
| --- | --- | --- |
| Local | Development and automated tests | Synthetic records; local/provider test adapters |
| Shared test/staging | Integrated API, React and Android acceptance | Separate credentials, database, storage and email recipients; synthetic data by default |
| Production/pilot | Approved business use | Restricted access, private assets, monitored services and tested recovery |

Choose providers and owners under DEC-02/25 in the [decision log](decision-log.md). Keep environment credentials separate. A staging email worker must not send to production recipients. Never copy real identity documents into developer fixtures.

Use Docker Compose for local development/test dependencies and containerized web/API/worker deployment. Staging and production connect to external managed PostgreSQL, with separately provisioned Redis and private file services. Keep local PostgreSQL excluded from deployed configurations. The platform and whether production uses Compose on a single host remain choices under DEC-02/25; see [infrastructure plan](infrastructure-plan.md).

The existing Swagger server binds to loopback and serves documentation. It is not the production API or a production hosting setup.

## 2. Define a reproducible release

When scaffolding is added, record these in the repository:

- Pinned compatible Node.js/TypeScript/Prisma CLI/runtime/driver and PostgreSQL versions, pnpm version/bootstrap for each install boundary, other runtime/SDK versions and committed `pnpm-lock.yaml` files for Node.js dependencies.
- Exact install, lint, test and build commands for each application.
- Reviewed migrations and their compatibility requirements.
- An environment template containing names and safe examples, without credentials.
- Build/deploy configuration and separate readiness/liveness probes.
- Where the immutable build artifacts, configuration versions and release records are kept.

Apply DEC-37 when adopting/updating dependencies or third-party release tools: verify official stable release/support evidence and compatibility, record exact tested versions, and document any necessary supported older-version exception with its concrete reason. Release installation reproduces those pins; it does not resolve moving `latest` tags or silently upgrade packages. See the [version policy](developer-setup.md#dependency-and-version-policy).

Bootstrap the recorded pnpm version and use `pnpm install --frozen-lockfile` for each Node.js install boundary in CI/builds, then run that package's actual scripts through pnpm. Verify its required build hooks and generation steps; do not copy the docs-only `--ignore-scripts` policy to application builds without validation. No workspace or CI vendor is selected by this policy.

Build from a recorded commit. Deploy the tested artifacts rather than rebuilding different dependencies during deployment. A release record should identify the backend, worker, both portals and Android versions, including components that did not change.

For containers, record immutable image digests alongside project-compliant release/commit tags. Use multi-stage builds, `.dockerignore`, least-privilege processes and explicit runtime secrets. Do not bake environment credentials into images or use development source mounts in production. Pin the supported Docker/Compose versions when scaffolding is added.

Generate the selected Prisma release's client/types and required artifacts from the recorded model revision before TypeScript checks/builds. Include generated output and required runtime/driver packages in API/worker images; verify the final image's imports and a PostgreSQL integration smoke test. Generation and migration application are distinct steps. Build without production credentials; provide validated runtime/migration configuration through the appropriate secret path. Add exact version-compatible scripts with the scaffold.

React portals use development servers locally and compiled static assets in production. Browser-facing settings must resolve to reachable public API origins, not Compose service names. The worker uses the matching backend image/release with a separate entry command.

Use HTTPS for deployed clients/API. Select secret storage, certificate management, private storage access and service permissions before using real data; see [security design](security-design.md).

## 3. Checks before merge and release

These are required evidence categories, not installed CI job names. Add actual commands with the relevant application scaffold.

| Changed area | Relevant checks and review |
| --- | --- |
| Documentation | Links, consistency with source contracts and `git diff --check` |
| OpenAPI/API documentation | `pnpm --dir docs/api run check`; inspect generated documentation when presentation changes |
| Backend | TypeScript checks, pinned Prisma model validation/generation, input/auth tests, business-rule tests, database integration/concurrency tests and build |
| React portals | Lint/build, affected workflows, company isolation, accessibility and responsive checks |
| Flutter | Analysis/build, affected API flows, Android device/network tests |
| Database | Migration from empty and prior schema, integrity constraints, compatibility and recovery impact |
| Docker/infrastructure | Validate each intended Compose file/profile combination, build images and verify startup/shutdown, port exposure, secret exclusion and dependency failure behavior; QA-27 |
| Redis | Company/user cache isolation, invalidation races, memory pressure and bounded outage fallback; QA-28/30 |
| Managed PostgreSQL | Selected version/driver/pool mode, connection budget, TLS, migrations, locking and isolated restore; QA-29 |
| Auth, OTP or files | Penetration tester review and applicable QA-23 evidence |
| Financial closure/statements | QA-12 through QA-18 as affected, including retries and concurrent requests |

An author cannot approve their own PR. Use the reviewer rules in the Git guide, including Flutter coordination for shared contracts. Test categories and acceptance IDs are defined in [testing strategy](testing-strategy.md).

Ordinary work PRs target `development` and are squash-merged by the admin. After integrated validation, the admin opens a release PR from `development` to `main`, merges with a merge commit, then synchronizes `main` back into `development` through the documented PR process. Publishing a build is a separate operational action; a merge does not prove deployment succeeded.

## 4. Database and client compatibility

Prefer changes in stages: add compatible fields/tables, deploy code that supports old and new forms, migrate existing records, then remove obsolete behavior in a later reviewed release. Check how long older Android clients must continue working before removing an API field or endpoint.

For every migration, document:

1. Expected duration, locking and affected tables.
2. Preconditions and how to validate the result.
3. Whether the previous application version can use the new schema.
4. How to recover from partial execution or failure.
5. Any data backfill and how it preserves immutable financial/history records.

Do not rewrite closed-trip amounts, payroll, wallet credits or frozen reports to accommodate a new formula. Change future behavior through an agreed contract and preserve historical results.

Prisma ORM is selected under DEC-34. Pin its version and migration workflow under DEC-01 before adding runnable commands. Keep the model and one reviewed migration history synchronized with the [design inventory](database/database-design.md#prisma-models-and-schema-ownership); include specialized SQL constraints/indexes/triggers and inspect the generated plan for accidental renames/drops. Do not use a schema push, reset or development migration-authoring flow against staging/production.

Use one controlled migration job per release with its reviewed connection/permissions. API replicas must not independently race to apply migrations. Reserve connections for the migration/operational path and test compatibility with the managed provider's direct or pooled connection modes. Apply only committed, reviewed migrations toward the recorded release schema; do not generate a new plan in production. Block API/worker rollout until schema validation succeeds.

On failure, stop the release, capture migration status and inspect actual schema/data before retrying. Follow the pinned Prisma release's recovery procedure: choose a reviewed forward repair or compatible rollback, reconcile migration history with actual effects and rerun validation in isolated staging first. Never mark a failed migration successful without verifying its effects, edit already-applied history, or assume every custom SQL operation rolls back atomically. Record the recovery evidence and preserve immutable financial data. See [Prisma recovery guidance](https://www.prisma.io/docs/orm/migrations/rollbacks-and-recovery) and [operations](operations-runbook.md#5-backups-and-restore).

## 5. Release procedure

The release owner coordinates these steps once infrastructure exists. Record who performs and verifies each step.

1. Identify the release commit/image digests, configuration changes, migrations and supported client versions. Verify the managed PostgreSQL endpoint/plan/region and Redis role/topology.
2. Confirm applicable acceptance evidence, independent review and resolved decisions for the released features.
3. Confirm the latest recoverable backup, private-file/key coverage and a successful restore exercise within the agreed policy.
4. Announce any agreed maintenance window through the team's chosen channel. Drain or pause affected mutations/workers when required by the migration plan.
5. Apply reviewed migrations and validate their result. Stop if validation fails.
6. Deploy compatible backend and worker images in the reviewed order. Check dependency readiness, managed connection headroom and graceful shutdown. Ensure competing workers use the same safe lease/claim protocol.
7. Deploy portal artifacts and distribute the approved Android build through the chosen channel.
8. Check service readiness, authorization and the end-to-end smoke journey in [testing](testing-strategy.md#5-end-to-end-smoke-journey). Use approved test accounts/data; never create fake production earnings for a smoke test.
9. Check financial invariants, notification delivery, private-file access and scoped cache behavior. Confirm cache bypass works without bypassing required session/abuse checks. Resume paused work when checks pass.
10. Record the outcome, deployed versions, evidence and any follow-up. The release owner decides whether to continue or roll back using the documented plan.

The exact platform commands, contacts and release window must be added under DEC-25 before the first shared deployment.

For the initial estimator, record and validate the speed/limits/policy version under DEC-32 and test rough/admin/unavailable states. No maps key or external provider is required. Reject invalid estimator configuration through the agreed validation path or expose unavailable status with an operational alert; never silently use the illustrative test speed. Deploy future provider integration as a separate reviewed change with quotas, storage terms and fallback tests.

## 6. Rollback

Before deployment, identify a previous compatible application artifact and the conditions for using it. A previous build is safe only if it supports the current schema, stored data and replay protocol.

Version cache payloads/keys so a rollout or rollback cannot misread another release's cached shape. Clear only disposable application cache when necessary; do not flush a shared store containing sessions, counters or jobs. Any critical Redis role requires an agreed compatible migration/recovery plan.

If smoke checks fail, stop the rollout and pause affected writes where needed. Preserve logs, command identities and committed business records. Roll back compatible application/configuration changes, or apply a reviewed forward fix if the schema cannot safely move backward.

Restoring an old production database can discard valid orders, approvals and credits. Treat it as incident recovery with an explicit reconciliation plan, not a routine deployment undo. Follow the isolated restore procedure in [operations](operations-runbook.md#5-backups-and-restore).

## 7. First production/pilot gate

All items below are **pending**, not completed by writing this guide.

- [ ] Release, incident and backup owners are named; staging/pilot access is agreed.
- [ ] Relevant DEC/GAP items are resolved and reflected in code/contracts.
- [ ] P0 workflows pass with recorded evidence; P1/P2 delivery scope is explicit.
- [ ] Auth/company boundaries, private files and OTP have security review evidence.
- [ ] Closure concurrency, permanent credit uniqueness and statement approval rules pass.
- [ ] Secrets, HTTPS, service permissions and observability are configured and checked.
- [ ] Docker images/configurations pass QA-27; deployed configuration excludes local databases and development mounts.
- [ ] Redis roles/limits and secure outage behavior are agreed and pass QA-28/30.
- [ ] Managed PostgreSQL plan, connection budget, migrations and restore behavior pass QA-29; Prisma generation/mapping and migration upgrades pass QA-31.
- [ ] The 1,000-account/100-active-user target has workload evidence against agreed DEC-23 thresholds/duration; QA-32. No capacity pass is claimed here.
- [ ] Recovery targets/retention are agreed and a restore exercise meets them.
- [ ] Migration, rollback, older-client support and user support procedures are reviewed.

Use the [readiness guide](development-readiness.md) to track preparation. This checklist does not certify that the application is ready to launch.
