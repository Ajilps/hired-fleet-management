# Developer setup

**Status — 17 October 2026:** documentation and application packages now have their own setup instructions. Use the [backend README](../backend/README.md) for the implemented foundation, migration lifecycle and tests, and the [admin README](../admin-portal/README.md) for the frontend. The remaining sections retain planning requirements for unimplemented features; they do not establish that authentication, business endpoints or production infrastructure work.

For local PostgreSQL/Redis/SeaweedFS startup, application container workflows, independent Docker builds and troubleshooting, follow the [developer Docker guide](docker-setup.md). Backend/admin packages are implemented; their READMEs record runtime verification. The [local object storage guide](local-object-storage.md) covers the selected development substitute; files APIs/scanning remain pending.

## 1. Start with the repository rules

Read [Git workflow](git-workflow.md), [naming conventions](naming-conventions.md), [system architecture](system-architecture.md) and the [infrastructure plan](infrastructure-plan.md). Work on a task branch from the latest `development`; open PRs into `development`. Only the repository admin merges protected branches.

In your existing checkout, first run:

```sh
git status --short
git branch --show-current
```

Preserve outstanding work before switching branches. Follow the clone/update commands in the Git guide rather than resetting a checkout. Do not commit local credentials or unrelated generated files.

## 2. Run the documentation now

The API documentation package requires Node.js 22.12 or later according to its checked-in `package.json`. Use an agreed, supported runtime that satisfies that constraint and the package's pinned pnpm version (currently `pnpm@12.10.1`). Keep `pnpm-lock.yaml`; follow the bootstrap policy below before running commands.

From the repository root:

```sh
cd docs/api
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pnpm run start
```

Open **http://127.0.0.1:8080** for Swagger UI. Stop it with Ctrl+C. If the port is occupied, use `DOCS_PORT=8081 pnpm run start`.

`pnpm run bundle` creates `openapi.json` from `openapi.yaml`. The JSON file is generated and ignored. Swagger UI is read-only until a backend is implemented.

## 3. Agree on the application toolchain

| Area | Existing direction | Must be recorded before its first implementation PR |
| --- | --- | --- |
| Backend | Node.js/Express in TypeScript with Prisma ORM, modular monolith in Docker | Compatible pinned Node.js/TypeScript/Prisma/pnpm versions, module layout, compiler/module settings and startup commands |
| Portals | React for admin and partner | Build tool, routing, shared components and exact dependency versions |
| Driver app | Flutter for Android | Flutter/Dart versions, Android SDK/emulator setup and supported device baseline |
| Containers | Docker and Compose selected | Supported versions, build stages, development profiles and health checks |
| Database | Docker PostgreSQL locally; managed PostgreSQL for staging/production | Exact major version, version-compatible Prisma migration workflow, provider/plan/region and connection budget |
| Redis | Docker locally; targeted cache selected | Version/client, initial caches, expiry/invalidation, memory policy and deployed hosting; session/queue roles remain open |
| Private files | SeaweedFS Community Edition in Docker locally; private object storage with quarantine/scan | Production provider, scan job, upload-context storage and access/retention policy |
| Email | Transactional outbox plus worker | Local email capture, provider adapter and worker command |
| Estimates | Initial local distance heuristic with admin override; routing adapters later | Calibrated speed, limits and policy version under DEC-32; no initial maps key/provider |

Record remaining choices under DEC-01/02/03/30 in the [decision log](decision-log.md). DEC-26 through DEC-29 and DEC-33/34 record the selected architecture and TypeScript/Prisma direction. pnpm is selected for Node.js packages under DEC-36; workspace topology, application pnpm version/bootstrap, cloud providers, queue library and test framework remain unselected. The documentation package's Node minimum is not an owner-selected backend runtime.

Once scaffolded, add exact install, migrate, seed, test, run and build commands here in the same PR. Verify them on a clean checkout. Do not add example commands for scripts that do not exist.

### Dependency and version policy

The owner's **latest reliable version** requirement (DEC-37) means the newest generally available stable release compatible with the project's runtime, framework, peer dependencies, database driver and deployment environment. Apply it when adopting project packages, software/libraries and third-party tools, including Node.js, pnpm, TypeScript, Prisma, container/database tooling and Flutter/Dart tools according to their ecosystems.

1. At adoption time, verify the official release notes, stable release/channel and support/compatibility information. Record the date, exact candidate version and source links; a moving `latest` tag alone is not evidence. Exclude release candidates, alpha/beta, canary/nightly and other prereleases by default.
2. Check compatibility with the other pinned components and actual target environment, then run the relevant project build, integration/security and migration checks. Stable upstream status alone cannot establish project reliability or promise a bug-free version.
3. Pin the tested package-manager/runtime/tool versions in their ecosystem's configuration. Keep Node package resolutions in the owning `pnpm-lock.yaml`; preserve Flutter/Dart SDK constraints and lockfiles through their own tooling. Use frozen installs for repeatable CI/releases.
4. If the newest stable release is incompatible or has a verified blocking regression, use the newest supported compatible stable version and record the concrete compatibility/stability reason, affected dependency, official evidence, validation and revisit condition. Routine dependency choices do not create a new user-approval gate.
5. Upgrade intentionally in a scoped change: review release notes and manifest/lockfile diffs, validate affected flows, then update pins and setup/release records together. Normal installation reproduces tested versions; it must not silently float to newer releases. This policy does not request a mass upgrade or select missing application versions now.

The API docs conversion preserves its existing dependency versions to isolate package-management changes. Its pnpm tooling pin is `12.10.1`, checked against the [official stable release](https://github.com/pnpm/pnpm/releases/tag/v12.10.1) and [installation compatibility](https://pnpm.io/installation) on 10 October 2026. Existing package/runtime versions are not newly claimed to be the latest; review them under this policy when intentionally adopted or updated. Application versions and bootstrap choices remain DEC-01.

### pnpm policy and bootstrap

The owner selected pnpm to manage Node.js dependencies. Node.js remains the runtime for backend/documentation scripts; Flutter continues to use Flutter/Dart tooling. pnpm does not choose a monorepo, workspace layout, CI platform or Node version.

- Record and verify an exact compatible pnpm version in `package.json`'s `packageManager` field at each chosen install boundary. `docs/api` currently pins `pnpm@12.10.1`; that docs-tooling pin does not settle application versions under DEC-01.
- Commit one `pnpm-lock.yaml` per independent install boundary, or one shared lockfile for a deliberately selected workspace. Keep dependency manifests and the owning lockfile together. Do not maintain npm/Yarn lockfiles for the same boundary or introduce a root workspace solely for this decision.
- Run `pnpm install --frozen-lockfile` in reproducible CI/release installs; a missing/outdated lockfile must fail instead of silently resolving new dependencies. Developers update the manifest/lockfile deliberately with the pinned pnpm version and review the diff.
- Use `pnpm run <script>` for scripts actually declared in that package and `pnpm exec <binary>` for its installed tools. Once Prisma is scaffolded and pinned locally, invoke it through pnpm scripts or `pnpm exec prisma` with that release's supported arguments; avoid downloading an unpinned CLI during builds/migrations. These forms describe execution policy, not missing application scripts.

First check `node --version` and `pnpm --version`, then compare the package pin and engine requirements. If pnpm is absent or mismatched, choose and document a compatible bootstrap method from the [official installation guide](https://pnpm.io/installation); do not assume Corepack is bundled with Node or available on every machine. If using Corepack, verify its availability/version separately. No system-wide installation or runtime upgrade is supplied by this documentation change.

Official [install](https://pnpm.io/cli/install), [script](https://pnpm.io/cli/run) and [local binary](https://pnpm.io/cli/exec) behavior was checked on 10 October 2026. Bootstrap the exact pin in CI/container builds before frozen installs; review required dependency build hooks per package. The docs-only `--ignore-scripts` choice is not a blanket policy for future Prisma/application builds.

### Prisma lifecycle to add with the scaffold

1. Pin compatible Prisma CLI/runtime/driver packages, Node.js, TypeScript and PostgreSQL versions, using pnpm for Node packages. Record the PostgreSQL connector, generated output location, compiler/module configuration and exact scripts in the backend package.
2. Configure runtime and privileged migration connections through validated environment/secret loading. Use the selected Prisma version's configuration format; do not assume the CLI loads the same environment file as the API. Set bounded pools separately for API and worker.
3. Translate the [DBML inventory](database/hired.dbml) into explicitly mapped Prisma models, preserving types/precision, keys and names. Follow [schema ownership](database/database-design.md#prisma-models-and-schema-ownership). Validate the model and generate its client/types before type-checking/building. Repeat generation after model changes.
4. Plan migrations locally, inspect the resulting operations/SQL and include custom integrity SQL through the same reviewed history. Apply to a disposable blank database and upgrade a prior-schema fixture; never replace shared migrations with an untracked schema push/reset.
5. Run an explicit, repeatable synthetic seed only against local/test data after migration. Do not depend on generation or migration implicitly seeding. Start API/worker only when their generated code and schema are compatible.

Commands and filenames differ between Prisma releases. The [current migration workflow](https://www.prisma.io/docs/orm/migrations/how-migrations-work) and [version transition guide](https://www.prisma.io/docs/orm/coming-from-prisma-orm-7) were checked on 10 October 2026; this does not select a release. Add executable install/configuration/generation/migration/seed commands only when the pinned scaffold and scripts exist. Release migrations follow the [controlled deployment job](deployment-guide.md#4-database-and-client-compatibility).

## 4. Environment configuration

Each implemented service should provide a `.env.example` with dummy values and a short description of every variable. Runtime files use `.env.dev`, `.env.test`, `.env.staging` or `.env.prod` as appropriate. Ignore local values before creating those files. Validate required values at startup and fail with a useful message that does not print the secret.

The following is a candidate configuration inventory, not existing application configuration:

| Setting | Used by | Secret? |
| --- | --- | --- |
| Database connection and pool limits | Backend/worker/migrations | Connection credentials: yes |
| Database TLS trust and separate migration connection | Backend/worker/migrations | Migration credentials: yes; public CA certificate: no |
| Redis endpoint, TLS and credentials | Backend; worker only if a Redis queue is selected | Credentials: yes |
| Cache namespace, expiry, timeouts and rebuild limits | Backend | No |
| Redis memory/eviction/persistence and critical-role settings | Infrastructure/affected services | Usually no; session secrets: yes |
| Allowed portal origins and public API origin | Backend/clients | No |
| Session signing/validation and token lifetimes | Backend | Signing material: yes |
| Close-code encryption key and key identifier | Backend | Encryption key: yes |
| Private storage bucket, endpoint and access credentials | Backend/scanner | Credentials: yes |
| Scan/upload limits and signed-link lifetime | Backend/scanner | Usually no |
| Email provider, sender and retry limits | Worker | Provider credential: yes |
| Maps provider and timeout | Backend | Provider credential: yes |
| Command replay retention and cleanup settings | Backend/worker | No |
| Heuristic average speed, input/duration bounds and policy version | Backend | No; values still need agreement and validation |

Keep server credentials out of React bundles, Flutter assets, Swagger examples and Git history. Mobile API addresses must be reachable from the test device; `localhost` on a physical phone refers to that phone.

The maps-provider setting above is for later integration only and must not be required for initial startup. The initial estimator uses supplied road distance and validated server policy; missing policy displays unavailable and alerts operations. Follow [travel-time estimation](travel-time-estimation.md); example speeds in documentation are not defaults.

## 5. Local services and startup order

After local infrastructure is implemented:

1. Start Docker and the selected development Compose services: local PostgreSQL, Redis cache and private storage substitute. Wait for dependency health checks.
2. Validate Prisma configuration/models, generate version-compatible client/types, and apply reviewed migrations to the development database only.
3. Start the scanner/email substitutes and use synthetic fixtures.
4. Run the seed command, then start the API and separate email worker containers.
5. Start the React development containers and the Android emulator/device using host Flutter tooling.
6. Run the smoke journey in [testing strategy](testing-strategy.md#5-end-to-end-smoke-journey).

Use `compose.yaml` plus the selected environment file and local dependency profiles described in the [infrastructure plan](infrastructure-plan.md#2-docker-layout-and-builds). A Compose file is not supplied by this documentation change. Do not run imagined application commands before scaffolding exists.

Inside Compose, services connect through service DNS names; `localhost` means the current container. Browsers and devices use the externally reachable API address, not internal service names. A physical Android device also needs the development API reachable over the chosen test network.

Use a named volume for development PostgreSQL and isolated disposable databases for automated tests. Clearing cache must be safe; deleting a PostgreSQL volume destroys its local data. Never point seed/reset scripts at staging or production.

## 6. Minimum seed data

Use repeatable synthetic data with stable IDs. Store no real identity documents or customer contact details in fixtures.

| Fixture | Why it is needed |
| --- | --- |
| Two distinct active admins | Creator-plus-other approval and cross-admin review |
| Two companies and one partner per company | Company isolation tests |
| Active, pending and suspended driver profiles | Activation/authorization gates |
| A second active driver | Reassignment and former-driver denial |
| Four synthetic identity documents | Onboarding and private-file tests |
| Received, rejected and accepted orders | Decision and duplicate-request tests |
| Unassigned, assigned, ongoing and closed trips | Lifecycle and read-only history |
| ₹10,000 trip with 30/70 split and ₹150 expenses | Exact ₹3,000/₹7,000 shares; separate expenses |
| Zero-price and no-expense trips | Valid boundary cases |
| Supplied road distance, unknown distance and admin override | Rough/unavailable/admin estimate labels, copied basis and frozen history; no maps service |
| Draft through published monthly statements | Version and visibility gates |

Bootstrap the first admin through a reviewed operational command once implemented. Do not create a public admin-registration endpoint or commit a shared default password. Record how to create the second admin and rotate temporary credentials; initial password-change UI currently needs an agreed API contract, tracked as GAP-01 in [traceability](requirements-traceability.md#4-integration-gaps).

## 7. Common problems

| Problem | Check |
| --- | --- |
| Swagger does not load | Run `pnpm install --frozen-lockfile --ignore-scripts` in `docs/api`; check the port and local server output |
| API requests fail from a portal | Confirm the API exists, the configured origin/port is correct, and its CORS policy permits that portal |
| Driver cannot start | Check user activation, driver status, current assignment, version and network separately |
| Attachment is refused | Check ownership, upload purpose/context and clean scan status |
| Statement cannot publish | Check frozen version and explicit creator-plus-other approvals |
| API cannot reach PostgreSQL/Redis in Docker | Check service DNS, health, network and credentials; do not use the container's own loopback for another service |
| Cache is unavailable | Verify bounded database fallback; required session checks must not be bypassed |

Before declaring setup complete, a second teammate must be able to follow the implemented commands on a clean checkout. Record the result in the setup PR.
