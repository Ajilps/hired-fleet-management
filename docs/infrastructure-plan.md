# Docker, Redis and managed database plan

**Updated:** 10 October 2026. The project owner selected Docker, Redis, managed PostgreSQL and an Express modular monolith in TypeScript with Prisma ORM. This is a plan; Dockerfiles, Compose files and application services do not exist yet.

Use this guide with [architecture](system-architecture.md), [developer setup](developer-setup.md) and [deployment](deployment-guide.md). Selected directions are DEC-26 through DEC-29 and DEC-33/34 in the [decision log](decision-log.md). Versions, providers and operating limits remain open under DEC-01/02/03/22/23/30.

## 1. What runs where?

| Component | Development/test | Staging/production |
| --- | --- | --- |
| Express/TypeScript monolith with Prisma ORM | Docker service with development tooling | Tested backend image |
| Email worker | Separate container, same backend code/image where practical | Separate process using the matching backend release |
| Admin React portal | Docker development server with hot reload | Compiled assets served by a web container |
| Partner React portal | Docker development server with hot reload | Compiled assets served by a web container |
| PostgreSQL | Isolated Docker database and persistent development volume | External managed PostgreSQL; provider/plan not chosen |
| Redis | Docker service for selected caching | Separately provisioned Redis; hosting not chosen |
| Private storage/scanner and email | Local/test adapters with synthetic data | Chosen private storage/scanner and email providers |
| Travel-time estimate | Local backend heuristic and test policy | Same local heuristic initially; external routing adapters later |
| Flutter Android app | Host tooling and emulator/physical device | Installed app calling the API |

The portals and Flutter call the API. Only authorized backend/worker/migration identities connect to PostgreSQL or Redis. Browser/mobile bundles must not contain their credentials.

The initial estimate needs no external maps service, geocoder or routing credential. Use optional supplied road distance and a server policy as defined in [travel-time estimation](travel-time-estimation.md). A future provider uses the same adapter boundary and approved fallbacks; provider costs, quotas and storage rules need review before activation. Do not add Redis caching for a cheap local formula without a measured benefit.

## 2. Docker layout and builds

Add these with the application scaffolds, following [naming rules](naming-conventions.md#9-docker-files-and-configuration):

| Planned file | Purpose |
| --- | --- |
| `Dockerfile` in each application directory | Build that service; worker can reuse the backend image with a different entry command |
| `.dockerignore` for each build context | Exclude local secrets, dependency folders, Git metadata and generated files not needed to build |
| Root `compose.yaml` | Shared service configuration |
| `compose.dev.yaml` | Development tooling, hot reload and local dependencies |
| `compose.test.yaml` | Isolated automated-test data/services where needed |
| `compose.staging.yaml` / `compose.prod.yaml` | Deployed configuration with external managed database connections |
| Service `.env.example` | Safe variable descriptions/examples; real values stay outside Git/images |

These filenames are planned, not files created by this documentation change. Document actual commands and the supported Docker/Compose versions when the files exist.

Use stable service keys such as `api`, `notification-worker`, `admin-portal`, `partner-portal`, `postgres` and `redis-cache`. Keep local PostgreSQL out of the deployed service set through explicit development/test profiles or separate local dependency definitions; a production override must not accidentally start it. Do not set `container_name`.

Select base images and third-party build/deployment tools under [DEC-37's stable compatible version policy](developer-setup.md#dependency-and-version-policy), recording tested pins/digests and any supported older-version reason.

Use multi-stage builds and committed `pnpm-lock.yaml` files at the chosen Node.js install boundaries. Bootstrap the pinned pnpm version, install with `pnpm install --frozen-lockfile`, and run declared build scripts through pnpm. Document any required dependency build hooks and preserve pnpm's resolved runtime dependency layout in final images; verify imports in the final image. Workspace layout remains DEC-01; Flutter uses its own tooling. Development includes hot reload; production contains built output and required runtime dependencies. Run application processes without root where supported. Record image versions/digests and build once for the release. Production source code must not be bind-mounted from a developer checkout. [Docker production guidance](https://docs.docker.com/compose/how-tos/production/)

Generate the pinned Prisma version's client/types and required runtime artifacts in the backend build before TypeScript checking/compilation. Include the correct generated output, driver/runtime dependencies and platform requirements in the API/worker image. Verify imports and database access in the final image; a successful generation step alone does not prove it will run there. Use the same model/migration revision for the separate release migration job.

Keep backend, database and Redis on private networks. Expose only needed web entry points. If local debugging requires database/Redis host ports, bind them to loopback. Deployed dependencies need restricted connectivity and verified encrypted connections.

Configure dependency health checks and application connection retries. Startup order alone does not mean PostgreSQL is ready; Compose supports health-based dependencies. After startup, the API/worker must also handle dependency disconnects. See [Docker startup guidance](https://docs.docker.com/compose/how-tos/startup-order/).

On shutdown, stop taking new work, allow in-flight transactions to finish within an agreed limit and stop worker claims. Leave incomplete email claims recoverable through their lease. Define resource limits, restart behavior and logs with the deployment configuration. Docker on one server still has a host-level failure risk; it does not provide automatic high availability.

## 3. Managed PostgreSQL

Choose provider, region, plan and supported PostgreSQL version before shared staging. Place the database near the API. Check availability, suspension behavior, storage/connection limits, backup retention, point-in-time recovery and export options for that specific plan.

Use separate development/test/staging/production data and credentials. Keep migrations in Git and apply each release's migration once through a controlled job, not independently from every API replica. Use least-privilege runtime credentials and separate migration permissions.

Reuse one configured Prisma client/database handle and its underlying pool per long-running API or worker process; do not create one per request or repository. Count every process and replica, including rolling-deployment overlap. Set explicit limits in the pinned Prisma/driver configuration rather than assuming a default or URL option applies to every release.

Budget maximum database connections as `API process count × API pool limit + worker process count × worker pool limit + migration/operations reserve`, within the provider's usable limit. Account for any additional pools/consumers and pooler backend caps; the reserve and actual numbers remain DEC-01/02/23 choices. A pooled frontend/client limit is not the database connection budget. Bound acquisition waits, transaction/statement time and reconnects with version-supported settings, monitor pool wait/exhaustion and test saturation. One hundred active users does not require one hundred dedicated database connections.

Test the exact Prisma release, PostgreSQL driver and provider pool mode for transactions, prepared statements, lock retention and worker claims. Use a separate privileged migration connection compatible with that tool/provider, direct when required; do not assume all migration operations work through the runtime pooler. Pool ownership/settings vary across Prisma versions; see the [version transition guide](https://www.prisma.io/docs/orm/coming-from-prisma-orm-7) and, if selecting v7, its [connection-pool documentation](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool).

Verify encryption and the database server certificate/hostname through the chosen driver's settings. Do not disable verification to make a managed connection work. [PostgreSQL TLS guidance](https://www.postgresql.org/docs/16/libpq-ssl.html)

Managed hosting does not change atomic closure, row locks, constraints or immutable records. Verify those on the chosen service. Database backups also do not cover private file objects or separately managed encryption keys; test coordinated recovery in the [operations runbook](operations-runbook.md#5-backups-and-restore).

The owner-confirmed planning target is 1,000 registered accounts and 100 simultaneous active users (DEC-35). Select the plan and pool budget using representative measured workload; no capacity result or provider size is established here. Agree latency/error limits and test duration under DEC-23; see [load validation](testing-strategy.md#7-capacity-and-load-validation). Prisma ORM itself is free/open-source; optional Prisma hosting is not selected.

## 4. Redis caching rules

Redis is a speed layer. PostgreSQL remains authoritative for accounts, company membership, trip state/rates, earnings, command replay and email intents.

Start with measured, read-heavy data where a short stale display is acceptable. Review every cached endpoint's data sensitivity and ownership. Do not cache close codes, identity documents, credentials or signed file URLs as ordinary application data. Financial closure and authorization always read authoritative state; an admin's cached rate display cannot decide payroll.

For each selected cache, record:

- Resource/endpoint, owner and intended performance benefit.
- Key scope: environment, schema/version, company or user where relevant, and normalized filters/pagination.
- Expiry, after-commit invalidation and behavior if invalidation fails.
- Whether stale display is allowed and its maximum age.
- Timeout, fallback and load limits for Redis/database failure.

Authorize before lookup and recheck the current relationship before returning private cached data. Never derive company scope from a cache key supplied by the client. Current assignment/activation changes must revoke access even if a cached response remains.

On a miss, read PostgreSQL and store only the approved response data. Update/invalidate after a committed mutation, not before commit. Handle the race where an old read repopulates a cache after invalidation; choose versioned entries or another reviewed strategy where necessary. Limit simultaneous rebuilds so an empty cache does not overload PostgreSQL.

A cache outage uses bounded timeouts and database fallback; cache loss must not lose business records. Record the initial cache list and limits under DEC-30 rather than inventing expiry values here.

## 5. Sessions, throttling and queues

Redis adoption does not select the authentication design. The current API draft uses access/rotating refresh tokens with PostgreSQL `auth_sessions`; JWTs can still require server-side revocation checks. Browser cookies/BFF or moving session authority to Redis require DEC-03/30 and matching API/client/schema tests.

If Redis becomes authoritative for sessions, record session expiry/revocation, persistence, restart/failover behavior and whether losing Redis forces everyone to sign in again. Never restore stale session copies in a way that re-enables revoked access. If Redis is only an acceleration layer, its outage must fall back to authoritative checks, and stale positive entries must not delay required revocation.

Rate limiting is also conditional. If Redis enforces required login/OTP limits, define atomic counters and a secure outage fallback; otherwise refuse affected operations. Redis loss must not reset durable failed-code attempt accounting or silently disable abuse controls.

Disposable caches may evict entries. Critical session/limiter/job state needs different guarantees. Isolate these workloads in separate instances/deployments when they need different memory, eviction or recovery policies; logical database numbers alone do not provide that isolation. Select policies and alert on memory/write failures. Redis documents [eviction behavior](https://redis.io/docs/latest/develop/reference/eviction/) and [persistence options](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/). Persistence alone is not a tested recovery plan.

## 6. Email management

Keep the existing PostgreSQL outbox as the durable list of emails to send. Acceptance, rejection and publication save their email intents in the same transaction as the business action. A worker claims due rows, sends outside the transaction and records the provider result or retry.

The first implementation can process this outbox directly. An email provider/transport library sends messages; a queue manages scheduling/retries. No queue library or provider is selected yet.

If Redis/BullMQ or another queue is later adopted, publish committed outbox IDs through a recoverable dispatcher. Do not independently write the order and Redis job and assume both succeeded. Define one delivery ownership/claim protocol so direct outbox workers and queue workers do not send the same intent concurrently. Queue duplicates/loss must be recoverable from PostgreSQL, and retries must remain safe.

Provider acceptance does not prove inbox delivery. A crash after send can produce a duplicate email unless the provider supports effective idempotency. Preserve intent uniqueness, bounded retries, sanitized failure monitoring and approved manual retry. No email failure may undo an accepted order or published statement.

## 7. Implementation checks

The additional planned cases are QA-27 through QA-32 in [testing strategy](testing-strategy.md#3-acceptance-cases). Validate Docker startup/shutdown, managed-database transactions, cache isolation/invalidation, Redis outages and any optional critical Redis roles. The [deployment gate](deployment-guide.md#7-first-productionpilot-gate) requires evidence before pilot use.
