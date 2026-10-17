# HireD backend

Runnable Express/TypeScript foundation for the shared admin, partner and driver API. This increment implements infrastructure probes and the `users`/`auth_sessions` schema. Authentication and business endpoints remain unimplemented; the admin portal still needs mocked responses for its feature workflows.

Follow the [development plan](development-plan.md) for milestones/dependencies and the [todo list](todo.md) for implementation tasks, decision gates and completion evidence.

## Local setup

Use Node **26.11.1** (`.node-version`) and pnpm **12.14.0**. Install that exact pnpm version if necessary with `npm install --global pnpm@12.14.0`. This directory owns its manifest and lockfile; there is no root workspace. `pnpm-workspace.yaml` configures this package's reviewed install hooks and release-age exceptions only.

Start PostgreSQL using the root [Docker guide](../docs/docker-setup.md), then run from `backend/`:

```sh
cp -n .env.example .env.dev
pnpm install --frozen-lockfile
pnpm run generate
pnpm run db:validate
pnpm run db:deploy
pnpm run dev
```

Match the database credentials/port in `.env.dev` to your local Compose environment. No command resets a database or creates an admin automatically. There is no public registration, bootstrap password or seed script in this increment. Synthetic integration fixtures are rolled back after each test; operational admin creation belongs with the authentication slice.

The API listens at `http://127.0.0.1:3000` by default:

- `GET /health`: process liveness, independent of PostgreSQL.
- `GET /ready`: 200 after checking both identity tables, otherwise a sanitized 503. An empty/unmigrated database is not ready.
- Unimplemented routes return the standard JSON 404 envelope. These probes expose no user information.

The API validates environment configuration at startup. Missing `DATABASE_URL`, invalid ports, unbounded pool settings and malformed CORS origins fail without printing supplied credentials. Configure exact browser origins; no wildcard or credentialed CORS is enabled. CORS does not authorize API requests. Responses include a server-generated `X-Request-Id`, security headers and `Cache-Control: no-store`. Request bodies/headers and database errors are not logged. JSON bodies are limited to 64 KiB.

## Configuration and database lifecycle

`pnpm run dev` and Prisma scripts load `.env.dev` using Node's native environment-file support; already exported environment values take precedence. Integration tests load `.env.test`. The compiled production process loads no local environment file: inject its environment through the deployment system.

| Setting | Purpose |
| --- | --- |
| `NODE_ENV`, `HOST`, `PORT` | Runtime mode/listener; defaults development, loopback and 3000 |
| `DATABASE_URL` | PostgreSQL runtime connection; default `public` schema only |
| `MIGRATION_DATABASE_URL` | Optional privileged connection used exclusively by Prisma CLI |
| `DATABASE_POOL_MAX` | Per-process pool ceiling, default 10, maximum 100 |
| `DATABASE_CONNECT_TIMEOUT_MS` | Connection/queue wait bound, default 2000 ms |
| `DATABASE_QUERY_TIMEOUT_MS` | Client query and PostgreSQL statement timeout, default 3000 ms |
| `CORS_ORIGINS` | Comma-separated HTTP(S) origins; defaults to no allowed browser origins |
| `TEST_DATABASE_URL` | Explicit disposable migrated integration database; never falls back to `DATABASE_URL` |

Use provider-reviewed TLS settings/CA trust for managed PostgreSQL; do not disable certificate verification. Pool sizing, managed provider configuration and production deployment remain open. Redis is not required by this increment and holds no sessions or authoritative data.

`prisma/schema.prisma` is the editable model source for the two implemented tables; the remaining [DBML](../docs/database/hired.dbml) is still planned. Preserve explicit snake_case mappings, native UUID/inet/timestamptz types, enum values and named constraints/indexes. IDs and timestamps are supplied explicitly, matching the design. The schema does not yet select email normalization, password hashing or session policy.

- `pnpm run generate`: generate `src/generated/prisma/` without a database URL/connection. Generated files are ignored and compiled into `dist/generated/` with the API.
- `pnpm run db:migrate --name <snake_case_description>`: develop a new migration on a disposable local database; inspect SQL before committing.
- `pnpm run db:deploy`: apply committed migrations using the migration connection, falling back to `DATABASE_URL`. Repeated deployment does not recreate data.
- `pnpm run build` then `pnpm run start`: compile and run `dist/index.js`. Generation must run before the first build.

Run release migrations separately before starting the API. Startup never runs migrations/seeds. SIGINT/SIGTERM mark readiness unavailable, drain HTTP requests, disconnect Prisma and enforce a ten-second shutdown deadline.

## Verification

```sh
pnpm run typecheck
pnpm run build
pnpm run lint
pnpm run test
# Set TEST_DATABASE_URL in .env.test to a disposable migrated PostgreSQL database:
pnpm run test:integration
```

Unit/HTTP tests cover configuration rejection, readiness failure/recovery/shutdown, CORS, safe errors and body limits. Real PostgreSQL tests cover mapped native fields, unique email/refresh hashes, foreign keys and installed indexes. They fail when the explicit test URL is absent. [Backend CI](../.github/workflows/backend-checks.yaml) provisions PostgreSQL 18.6, applies the history twice, builds/typechecks/lints/tests and builds the runtime image. A first migration has no prior application schema to upgrade; later migrations need populated upgrade fixtures.

Docker builds use the pinned Node image and backend pnpm version. Build with `docker build -t hired-api:local backend` from the repository root. The root Compose API build overrides pnpm independently of the portals. See [Docker setup](../docs/docker-setup.md) for networking. Do not count this foundation as verified frontend authentication or backend workflow integration.

Verified locally on 17 October 2026: frozen installation, offline generation, schema validation, typecheck, lint, build, **6 unit/HTTP tests** and **3 PostgreSQL integration tests** passed. Migration deployment passed on a second blank database and repeated without pending changes. The runtime image built with Node 26.11.1; container checks proved readiness failure before migration, recovery after migration, liveness/readiness separation during a PostgreSQL outage and clean SIGTERM exit (code 0). Compose configuration and workflow YAML parsed successfully. Host checks used installed Node 26.5.0; GitHub-hosted CI and managed-database integration remain unverified. Disposable test containers/volumes/network were removed.

## Toolchain record — 17 October 2026

Versions and engine/peer requirements were checked against official release information and npm metadata; exact direct pins and transitive resolutions are in the manifest/lockfile.

| Choice | Evidence and compatibility |
| --- | --- |
| Node 26.11.1 / pnpm 12.14.0 | [Node release](https://nodejs.org/en/blog/release/v26.11.1), [pnpm release](https://github.com/pnpm/pnpm/releases/tag/v12.14.0); Node satisfies all selected package engines |
| Express 5.3.0 | [Release](https://github.com/expressjs/express/releases/tag/v5.3.0); current supported Express 5 APIs |
| Prisma CLI/client/PG adapter 7.10.1 | [Stable release](https://github.com/prisma/orm/releases/tag/7.10.1); [Prisma 8 remains a release candidate](https://www.prisma.io/docs/orm/release-status), excluded under DEC-37; use the supported [v7 generated client](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators) and PG adapter |
| TypeScript 6.0.3 | Compatibility exception: TypeScript 7.0.2 is stable, but typescript-eslint 8.71.2 declares `>=4.8.4 <6.1.0`. Use the newest supported 6.x patch; revisit when the [ESLint tooling](https://typescript-eslint.io/users/dependency-versions/) supports TS7 |
| PostgreSQL 18.6 / pg 8.23.1 | Match the repository's pinned [PostgreSQL Docker image](https://hub.docker.com/_/postgres); [node-postgres](https://node-postgres.com/apis/pool) provides explicit pool/query bounds |
| ESLint 10.13.0, Zod 4.6.7, Helmet 8.3.0, CORS 2.8.6, tsx 4.23.15, Supertest 7.3.1 | Official npm stable metadata/engine checks; only Prisma/esbuild install hooks approved. The exact ESLint release-age exception is recorded in pnpm configuration |

Clean committed-source verification on 17 October 2026: an export of foundation commit `1dfdeeb` passed frozen installation, offline generation/build, Prisma validation, blank/repeated migration deployment, typecheck, lint and all 9 tests using the pinned Node 26.11.1/pnpm 12.14.0 Docker environment. This is author verification; independent teammate setup and remote CI evidence are tracked separately in [todo.md](todo.md).

Next increment: implement browser sign-in persistence using the owner-selected secure HttpOnly refresh cookie after completing DEC-03 cookie/CSRF/CORS, lifetimes, password policy and bootstrap contracts. Login/logout/current-admin need denied-access and revocation tests against PostgreSQL. Authentication has not been implemented by this foundation.

References: [architecture](../docs/system-architecture.md), [database design](../docs/database/database-design.md), [API contract](../docs/api/openapi.yaml) and [security design](../docs/security-design.md).
