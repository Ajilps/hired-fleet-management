# Developer Docker guide

Use this guide to start local dependencies, develop one application, run the full stack, or build and run each application image independently.

**Current status:** PostgreSQL and Redis have runnable configuration. The backend and React portals are still directory skeletons: their manifests, lockfiles, scripts and application code do not exist yet. Application commands below apply **after initialization**. Compose configuration has been checked; image builds and container startup have not been verified. Flutter runs with host Android/Flutter tooling.

## 1. Understand the files

A Dockerfile is a recipe for building an **image**. A **container** is a running instance of that image. Compose coordinates containers and their configuration. Build stages are steps used to create an image, not separate services that you start.

| File | Responsibility |
| --- | --- |
| `backend/Dockerfile` | Install backend dependencies, generate Prisma, compile TypeScript and package the API |
| `admin-portal/Dockerfile` | Build the admin React application; serve compiled assets with Nginx |
| `b2b-portal/Dockerfile` | Build the business partner React application; serve compiled assets with Nginx |
| Each application's `.dockerignore` | Exclude secrets, host dependencies and generated files from its build context |
| Each portal's `nginx.conf` | Serve static assets on port 8080 and return `index.html` for React client routes |
| Root `compose.yaml` | Configure PostgreSQL, Redis, applications, ports, networks, volumes and dependency startup |
| Root `.env.example` | Checked-in example settings for local Compose; copy to ignored `.env` |
| Each application README | Explain that application's initialization requirements and eventual commands |

Each project owns its own dependencies and lockfile. There is no root Node.js package or pnpm workspace. Docker ignores apply to image builds, not to Compose's source bind mounts.

## 2. Prerequisites

Command examples use a POSIX shell such as Bash or zsh. On Windows, use a suitable shell such as WSL rather than pasting these examples into PowerShell unchanged.

1. Clone the repository and follow the [Git workflow](git-workflow.md). Run the commands in this guide from the checkout directory containing `compose.yaml`.
2. Install Docker Engine and the Compose plugin, or a desktop distribution that provides both. See [Docker's installation options](https://docs.docker.com/compose/install/).
3. Start the Docker engine before building images or starting services. Docker CLI alone is not an engine.
4. Allow access to container image registries and package registries for initial pulls/builds.

Check your installation:

```sh
docker --version
docker compose version
docker info
```

`docker info` should connect successfully. The configuration was checked with Docker CLI 29.8.1 and Compose 5.1.2; other versions must support profiles, health-based dependencies, build targets and `up --wait`.

You do not need host Node.js/pnpm just to start PostgreSQL and Redis or run initialized applications in Docker. Running an application directly on the host requires that project's pinned toolchain. Flutter requires its own host toolchain.

## 3. First-time setup: dependencies only

From your repository root, copy the example without overwriting an existing local file:

```sh
cp -n .env.example .env
```

Edit `.env` before starting if your ports are occupied. Its credentials are local examples. Keep real `.env` files out of Git.

Validate and start PostgreSQL and Redis:

```sh
docker compose --profile dev config --quiet
docker compose --profile dev up -d --wait
docker compose --profile dev ps
```

Expected result: `postgres` and `redis-cache` report healthy. No application image is built by this workflow. The first run downloads the dependency images.

Check their connectivity:

```sh
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;"'
docker compose exec redis-cache redis-cli ping
```

Expected results are a SQL row containing `1` and Redis `PONG`. These confirm basic connectivity, not application migrations or correctness.

## 4. Choose your daily workflow

| Work | Command | What starts |
| --- | --- | --- |
| Host application development | `docker compose --profile dev up -d --wait` | PostgreSQL and Redis only |
| Backend development, after initialization | `docker compose up -d --build api` | API, PostgreSQL and Redis |
| Admin development, after initialization | `docker compose up -d --build admin-portal` | Admin, API, PostgreSQL and Redis |
| B2B development, after initialization | `docker compose up -d --build b2b-portal` | B2B, API, PostgreSQL and Redis |
| Full integration, after initialization | `docker compose --profile apps up -d --build` | All five services |

Explicitly targeting a service activates its profile and starts its declared dependencies. It does not start unrelated application services. Omit `-d` to keep logs attached to your terminal; Ctrl+C then stops the attached stack. With `-d`, containers keep running in the background. [Compose startup options](https://docs.docker.com/reference/cli/docker/compose/up/).

If an API is already available, start a portal without starting its dependencies:

```sh
docker compose up -d --build --no-deps admin-portal
```

The portal still needs the configured API for its features. For B2B, replace the service name with `b2b-portal`.

Before the full stack, validate its configuration:

```sh
docker compose --profile apps config --quiet
```

The `dev` profile contains only database/cache services. The `apps` profile also includes application services. With no profile and no explicit service target, no services start.

## 5. Addresses and configuration

| Service | From your computer | From containers on the same network |
| --- | --- | --- |
| PostgreSQL | `localhost:5432` | `postgres:5432` |
| Redis | `localhost:6379` | `redis-cache:6379` |
| API | `http://localhost:3000` | `http://api:3000` |
| Admin development server | `http://localhost:5173` | `http://admin-portal:5173` |
| B2B development server | `http://localhost:5174` | `http://b2b-portal:5173` |

Host ports can be changed in `.env`; container ports remain fixed. A mapping such as `127.0.0.1:5174:5173` publishes container port 5173 on your computer's port 5174. Publishing to loopback restricts access to this computer. `EXPOSE` in a Dockerfile documents a port; it does not publish it.

Both portals can use container port 5173 because containers have separate networking. The API joins the application network and internal data network. Portals do not join the database/cache network. Containers resolve service names only on shared networks. [Compose networking](https://docs.docker.com/compose/how-tos/networking/).

### Environment values

- Root `.env` supplies Compose interpolation values. Exported shell variables take precedence; do not source `.env` as a shell script.
- `${VARIABLE:-default}` uses a default if a variable is missing or empty. `${VARIABLE:?message}` requires a value.
- `x-node-build-args` defines shared build arguments. `&node-build-args` names the YAML anchor and `*node-build-args` reuses it for the three Node.js builds.
- `build.args` passes Dockerfile `ARG` values, such as Node.js/pnpm versions. A direct `docker build` does not automatically load the root `.env`.
- A service's `environment` maps runtime values into the container. Root `.env` values are not all automatically injected.
- `API_BASE_URL` is a public browser setting. Wire it into the chosen frontend build tool; an arbitrary container variable does not automatically appear in browser code.

See [Compose interpolation rules](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

A host-run backend must use `localhost` with published PostgreSQL/Redis ports. A container backend uses `postgres` and `redis-cache`; `localhost` inside a container means that same container. Browsers use the host API URL, not `http://api:3000`.

The example host database URL is `postgresql://hired_dev:local-dev-only-change-me@localhost:5432/hired_dev?schema=public`. For the container URL, replace `localhost` with `postgres`. Adapt credentials and host ports to your own settings. Keep database names/users/passwords URL-safe, or supply a percent-encoded `DOCKER_DATABASE_URL` in the root `.env`.

Changing PostgreSQL initialization variables does not change credentials already stored in an existing database volume. Update the database credentials deliberately or use a separate fresh local project/volume.

Flutter is outside Compose. Android emulators normally use `10.0.2.2` to reach the host API. Physical-device connectivity requires separate host network/access configuration; loopback-only publishing is not that configuration.

## 6. Editing code and updating dependencies

Compose bind-mounts each application's source folder into `/app`. Local edits become visible inside its development container. Hot reload works only after the application's `dev` script configures a watcher/server bound to the required host and port.

Separate named volumes hold container `node_modules`. Host-installed dependencies are not used by the application containers. Startup uses the frozen lockfile to reconcile container dependencies; backend startup also regenerates Prisma.

| Change | Action |
| --- | --- |
| Application source | Let the configured development watcher reload; rebuild runtime images |
| Manifest or lockfile | Update both with the project's pinned pnpm, then rebuild/recreate that service |
| Dockerfile | Rebuild/recreate that service |
| Root `.env` or Compose runtime environment | Recreate affected services with `up`; `restart` alone does not apply new container environment values |
| Prisma schema | Regenerate and apply the reviewed migration using the backend's documented workflow |

For example, rebuild the backend with its dependencies, or just the admin portal when its API is already running:

```sh
docker compose up -d --build api
docker compose up -d --build --no-deps admin-portal
```

Do not hand-edit a frozen lockfile or remove it to bypass an install error. Application migrations and seeds do not run automatically. Their real commands must be added when the backend is initialized; `generate` creates Prisma client code, not database tables.

## 7. Everyday commands

These commands assume the relevant containers have been started:

```sh
# Show the local stack, including stopped containers.
docker compose --profile apps ps -a

# Follow logs; Ctrl+C ends log following, not detached containers.
docker compose logs -f api
docker compose logs --tail=100 postgres redis-cache

# Open a shell or inspect the running backend's package manager.
docker compose exec api sh
docker compose exec api pnpm --version

# Stop a single application without removing its container.
docker compose stop admin-portal

# Stop and remove Compose containers/networks, retaining named volumes.
docker compose --profile apps down
```

`exec` requires a running container. `up --build` can create or recreate one. Application `exec` commands remain unavailable until application initialization and startup succeed.

## 8. Build stages and initialization requirements

| Stage | Backend | React portals |
| --- | --- | --- |
| `base` | Node.js, OpenSSL and CA certificates | Not needed |
| `tooling` | Pinned pnpm and non-root build user | Pinned pnpm and non-root build user |
| `dependencies` | Locked development/runtime dependencies | Locked development/build dependencies |
| `development` | Prisma generation and development startup | Development server startup |
| `build` | Generate Prisma, compile to `dist/index.js` | Build static assets to `dist/index.html` |
| `production-dependencies` | Prune development dependencies | Not needed |
| `runtime` | Node.js, compiled output, production dependencies and package metadata | Nginx, compiled assets and server configuration |

Compose selects `development`. A normal `docker build` selects the final `runtime` stage. Runtime stages copy only required artifacts instead of inheriting source and development dependencies. Backend runtime uses non-root `node`; portal runtime uses non-root `nginx` on port 8080.

Before application builds can work:

1. Each Node.js project needs its own `package.json` and committed `pnpm-lock.yaml`, with a `packageManager` matching the Docker pnpm argument (initial candidate: `pnpm@12.11.2`).
2. Backend needs `dev`, `generate` and `build` scripts. Generation must work without a live database or real credentials. Build output must include `dist/index.js`; custom generated Prisma/runtime assets must be in `dist/` or retained in runtime `node_modules`.
3. Each portal needs `dev` and `build` scripts; its build must emit `dist/index.html`. Wire the public API setting into the selected bundler.
4. Backend development must bind to `0.0.0.0:3000`; portals to `0.0.0.0:5173`. Configure strict web-server ports. Frameworks do not universally consume `HOST`/`PORT` automatically.
5. Validate package, runtime, Prisma/driver and native-library compatibility; configure approved dependency build hooks.

Manifest copying precedes source copying for dependency caching. Install lifecycle scripts must work before source is copied; put Prisma generation in the explicit `generate` script instead of a source-dependent root `postinstall`. If a package requires other files during installation, add those files to the dependency stage when adopting it.

## 9. Build and run Dockerfiles independently

This section applies **after application initialization**. Commands use default local ports and must run from the repository root. A direct Docker run does not start dependencies or automatically mount local source.

### Build runtime images

```sh
docker build --target runtime -t hired-api:local ./backend

docker build --target runtime \
  --build-arg API_BASE_URL=http://localhost:3000 \
  -t hired-admin-portal:local ./admin-portal

docker build --target runtime \
  --build-arg API_BASE_URL=http://localhost:3000 \
  -t hired-b2b-portal:local ./b2b-portal
```

The last path is the build context; Docker reads its `Dockerfile` and `.dockerignore`. `--target` selects a stage and `-t` names the image. Use `--target development` to build development images instead. Direct builds use Dockerfile version defaults unless you pass `--build-arg NODE_IMAGE=...` and `--build-arg PNPM_VERSION=...` explicitly.

The public API URL is compiled into web assets. Pass the real browser-accessible URL for the intended environment when building; runtime environment changes cannot rewrite those files. Nginx serves the SPA and does not proxy `/api`. Use a full URL or add a separately reviewed reverse proxy.

### Run the backend runtime image

First start the dependency profile from section 3. Create an ignored `backend/.env.dev` for this container example, adjusting these example values to your local configuration and adding any further variables required by the implemented backend:

```dotenv
DATABASE_URL=postgresql://hired_dev:local-dev-only-change-me@postgres:5432/hired_dev?schema=public
REDIS_URL=redis://redis-cache:6379
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

Run the API in one terminal:

```sh
docker run --rm --init \
  --network hired_data-network \
  --env-file backend/.env.dev \
  -p 127.0.0.1:3000:3000 \
  hired-api:local
```

`hired_data-network` is created by the default Compose project `hired`. If you override the project name, use its corresponding network name. Dockerfile runtime defaults still set `NODE_ENV=production`; this is a local runtime-image check, not a deployment recipe. Apply required migrations separately before application use. Do not also run the Compose API on the same host port.

### Run portal runtime images

Use another terminal for each portal:

```sh
docker run --rm --init \
  -p 127.0.0.1:5173:8080 \
  hired-admin-portal:local
```

```sh
docker run --rm --init \
  -p 127.0.0.1:5174:8080 \
  hired-b2b-portal:local
```

Open the published host addresses. Portal runtime images listen on 8080, while development images listen on 5173. No database network is needed for static serving; the browser calls the API URL built into the assets. Ensure the backend permits those browser origins.

`--rm` removes the container after it exits; it does not remove the image. `--init` forwards signals and reaps child processes. Ctrl+C stops these foreground runs. Compose `down` does not manage containers created directly by `docker run`.

Runtime images have no source bind mounts or hot reload. Rebuild them after source changes. They do not automatically migrate or seed the database. The backend runtime intentionally omits migration source and the Prisma development CLI; use a separate migration job from the same revision. Production deployment still needs TLS, secrets, readiness, managed PostgreSQL, immutable image digests and release verification.

## 10. Storage and startup behavior

- `postgres-data` preserves local database files across container replacement and normal Compose `down`. The PostgreSQL 18 image mounts `/var/lib/postgresql`. A volume is not a backup.
- The three application dependency volumes preserve independent container `node_modules` directories. Their startup command reconciles them with the lockfile.
- Redis has no data volume and has persistence disabled. Cache contents may disappear on restart. Its local limit is 128 MiB with `allkeys-lru`; this does not establish a production/session/queue policy.
- Adding `--volumes` to Compose `down` deletes named volumes, including the local database. It is not part of normal shutdown. Never use a broad Docker prune command as routine troubleshooting.
- The API waits for PostgreSQL/Redis health at initial startup. Portals wait only for API process startup, not HTTP readiness. Applications must handle temporary unavailability and reconnect after startup.

## 11. Troubleshooting

| Symptom | Check and next action |
| --- | --- |
| Cannot connect to Docker daemon/socket | Start the Docker engine; check `docker info` and `docker context show` |
| Missing `POSTGRES_PASSWORD` | Copy `.env.example` to root `.env`, set the value and run from the directory containing `compose.yaml` |
| No services selected | Choose `--profile dev`, `--profile apps`, or an explicit service name |
| `package.json`/lockfile missing or script not found | Application initialization is incomplete; do not expect the application profile to work yet |
| pnpm version mismatch or frozen-lockfile failure | Match the project's `packageManager` and Docker build argument; regenerate the lockfile with the pinned version and rebuild |
| Host port already allocated | Change the corresponding root `.env` port and recreate affected services; internal ports stay unchanged |
| Database password rejected after editing `.env` | Initialization values only affect fresh volumes; reconcile the existing database credentials deliberately |
| API cannot reach database/cache | Use service hostnames inside containers and localhost/published ports on the host; check logs and network membership |
| Portal renders but API calls fail | Check browser-facing API URL, backend availability, CORS and bundler variable wiring; rebuild runtime assets after changing their URL |
| Hot reload does not respond | Check bind mounts, `dev` script watcher settings and binding to `0.0.0.0`; configure polling if required by the chosen watcher |
| Prisma missing/generated client fails | Check the explicit generation script, output copied to runtime, production dependencies and native-library compatibility |
| Dependency remains unhealthy | Inspect `docker compose --profile apps ps -a` and dependency logs; fix the failure before starting clients |

Before sharing logs or resolved configuration, remove credentials, tokens, personal data and connection URLs. `config --quiet` validates without printing the resolved configuration.

## Version evidence and validation

Checked on 14 October 2026. Development candidates are pinned rather than floating at `latest`:

| Component | Candidate | Official evidence |
| --- | --- | --- |
| Node.js image | `node:26.11.1-bookworm-slim` | [26.11.1 stable Current release](https://nodejs.org/en/blog/release/v26.11.1), [official image variants](https://github.com/nodejs/docker-node) |
| pnpm bootstrap | `12.11.2` | [stable release](https://github.com/pnpm/pnpm/releases/tag/v12.11.2), [runtime compatibility](https://pnpm.io/installation) |
| PostgreSQL image | `postgres:18.6-bookworm` | [18.6 release](https://www.postgresql.org/docs/release/18.6/), [official image and volume layout](https://github.com/docker-library/docs/blob/master/postgres/README.md) |
| Redis image | `redis:8.10.2-bookworm` | [8.10.2 release](https://github.com/redis/redis/releases/tag/8.10.2) |
| Portal runtime image | `nginx:1.30.5-alpine` | [official stable release](https://nginx.org/en/download.html), [official image source](https://github.com/nginx/docker-nginx) |

Node 26.11.1 is a stable Current release, not yet LTS at this review. These versions are development candidates; there is no application compatibility result yet. Application initialization must validate framework/Prisma/driver/runtime compatibility under DEC-37, record any supported-version exception and lock the adopted versions per project. The existing API documentation's pnpm pin is unchanged. Release images need tested immutable digests and separate production configuration.

Compose configuration is validated with Docker CLI 29.8.1 and Compose 5.1.2. At creation, the local Docker engine was stopped, so image pulls/builds, actual dependency health, database persistence and non-root application startup could not be tested. Official release evidence is not proof that these image tags have been pulled or run here.

References: [multi-stage Docker builds](https://docs.docker.com/build/building/multi-stage/), [production dependency pruning](https://pnpm.io/cli/prune), [Compose profiles](https://docs.docker.com/compose/how-tos/profiles/), [health-based startup ordering](https://docs.docker.com/compose/how-tos/startup-order/) and the [infrastructure plan](infrastructure-plan.md).
