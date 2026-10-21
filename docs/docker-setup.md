# Run HireD locally with Docker

The default Compose stack runs PostgreSQL, the Express API, the admin portal and the business portal starter. Docker handles Node.js/pnpm and application dependencies. Flutter runs separately on the host.

## First start

Start Docker Desktop, OrbStack or your Docker engine. In the repository root (the directory containing `compose.yaml`):

```sh
cp -n .env.example .env
```

Edit `.env` and set `LOCAL_ADMIN_PASSWORD` to a password of **15–128 characters**. Optionally set `LOCAL_ADMIN_EMAIL` and `LOCAL_ADMIN_NAME`. Then:

```sh
docker compose up --build
```

The first build downloads images and installs dependencies. Wait for the API to become healthy and Vite to print its URLs.

| Service | Local address |
| --- | --- |
| Admin portal | http://localhost:5173 |
| Business portal starter | http://localhost:5174 |
| API liveness | http://localhost:3000/health |
| API/database readiness | http://localhost:3000/ready |

Sign in to the admin portal with the credentials you chose in `.env`. Use `localhost` consistently in the browser so cookie hostnames match. The business portal is a starter; this command does not complete pending product APIs or client integrations.

## What startup does

Only the development Compose API command (`backend/scripts/start-local.mjs`) performs automatic setup:

1. Require an explicit local admin password; generate independent random auth/replay/document-encryption keys in the `backend-local-state` named volume, unless supplied through `.env`.
2. Reconcile pinned dependencies and regenerate Prisma from the mounted source.
3. Apply committed migrations to the Compose database; never reset or seed sample business records.
4. Create the configured first admin only when no admin exists. Existing users, passwords, enabled states and sessions are preserved.
5. Start the API; Compose waits for `/ready` before starting the portals.

The API startup script and admin helper require `NODE_ENV=development` and the explicit `LOCAL_COMPOSE_STARTUP=true` flag supplied by Compose. The production image and ordinary backend startup retain separate operational migration/admin creation commands. Compose startup uses its own environment rather than a host `backend/.env.dev`.

Changing `LOCAL_ADMIN_PASSWORD` or `LOCAL_ADMIN_EMAIL` after initial setup does not change existing accounts. Use the original credentials and the supported account lifecycle. Keys persist across container rebuilds. Existing two-key volumes acquire an independent `document-key.json` without rotating auth/replay keys. Losing or replacing keys invalidates sessions/replay fingerprints or prevents recovery of retained encrypted document numbers. See the [document policy](../backend/documents.md) for explicit overrides and key custody. Do not copy this local setup into a deployment.

## Everyday commands

```sh
# Start again; rebuild after changing Dockerfiles/dependencies.
docker compose up

# Alternatively, run in the background.
docker compose up -d --build

# View service status and application logs.
docker compose ps
docker compose logs -f api admin-portal

# Stop and remove containers while retaining data and keys.
docker compose down
```

Ctrl+C stops a foreground stack. `docker compose down --volumes` deletes the local database, keys and other named volumes; it is not a routine stop command. Avoid broad Docker prune commands.

## Optional private uploads and scanning

Set `PRIVATE_UPLOADS_ENABLED=true` in the root `.env`, then:

```sh
docker compose --profile dev up --build
```

The `dev` profile adds SeaweedFS private storage and ClamAV. The `apps` profile is an alias for the same full stack. `storage` and `scanner` profiles select those optional services individually; default services also run unless service names are supplied.

ClamAV can take several minutes to load signatures and needs up to 4 GiB RAM. It uses amd64 emulation on Apple Silicon. Uploads may be unavailable until the scanner is healthy; the basic admin workflow remains usable. Use synthetic files while retention/real-identity-data policies remain unresolved. Attachment, authorized downloads and activation are separate pending backend work.

For dependency-only startup, explicitly name the desired services:

```sh
docker compose up -d --wait postgres
docker compose --profile storage up -d --wait seaweedfs
docker compose --profile scanner up -d --wait clamav
```

See [local object storage](local-object-storage.md) and [private files](../backend/files.md).

## Environment and ports

`.env.example` owns local Compose defaults. Copy it once; `cp -n` preserves an existing `.env`. Add the `LOCAL_ADMIN_*` settings manually if your existing file predates automatic setup. Local environment files are ignored by Git.

| Variable | Default/purpose |
| --- | --- |
| `LOCAL_ADMIN_EMAIL` | `admin@example.com` |
| `LOCAL_ADMIN_NAME` | `Local Admin` |
| `LOCAL_ADMIN_PASSWORD` | Required, no default; 15–128 characters |
| `POSTGRES_PORT` | `5432` |
| `REDIS_PORT` | `6379` |
| `API_PORT` | `3000` |
| `ADMIN_PORT` | `5173` |
| `B2B_PORT` | `5174` |
| `AUTH_SESSION_KEY`, `COMMAND_FINGERPRINT_KEY` | Optional independent 32-byte base64url overrides; otherwise persisted random keys |
| `PRIVATE_UPLOADS_ENABLED` | `false` |

Use URL-safe database credentials or set `DOCKER_DATABASE_URL` with properly encoded credentials. Database initialization settings only apply to a fresh PostgreSQL volume; editing the password in `.env` does not change an existing database password.

Inside containers the database hostname is `postgres`; a host-run API uses `127.0.0.1` and the published port. Browser API addresses use `localhost`, never container service names. Compose injects the browser API origin and allowed portal origins from the selected host ports.

## Host development and images

To run Node.js applications on the host instead, start only PostgreSQL as above and follow the [backend README](../backend/README.md) and [admin README](../admin-portal/README.md). Each package owns its dependencies and lockfile; there is no root pnpm workspace. The backend pins pnpm 12.14.0, admin 12.5.1 and business portal 12.11.2.

Compose uses source bind mounts for hot reload and separate container dependency volumes; host `node_modules` are not reused. Both Vite servers bind to all container interfaces; the API binds to `0.0.0.0` inside its container. Published host ports remain loopback-only.

Production runtime image builds remain separate:

```sh
docker build -t hired-api:local backend
docker build -t hired-admin-portal:local admin-portal
docker build -t hired-b2b-portal:local b2b-portal
```

Production requires separately applied migrations, secrets and operational admin bootstrap; automatic local setup is not part of those image entrypoints.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Cannot connect to Docker | Start the engine and check `docker info` |
| API says `LOCAL_ADMIN_PASSWORD` is missing | Set it in the root `.env`; restart Compose |
| Port is already allocated | Change the relevant port in `.env` and rerun Compose |
| Database rejects credentials | Match the credentials used to initialize the existing volume |
| Admin login fails after editing `.env` | Restart preserves existing accounts; use the original account/password |
| Portal cannot call API | Use `localhost` consistently; inspect API readiness and the configured ports |
| Dependencies or migrations fail | Inspect `docker compose logs api`; startup fails before serving requests |
| Invalid persisted local keys | Restore the local key volume; do not silently regenerate keys for existing data |
| Uploads unavailable | Enable uploads, start optional services and check ClamAV/SeaweedFS health |

Remove credentials, tokens, connection URLs and personal data before sharing logs. `docker compose config --quiet` validates configuration without printing resolved values.

## Verification record — 18 October 2026

An isolated Compose project built and started all four default services from a blank database. Browser-mode login returned an HttpOnly cookie and current admin identity; both published portal ports returned HTTP 200. Re-running the local admin helper with different requested credentials preserved the existing account. Removing/recreating containers without deleting volumes preserved the single admin ID/password hash and both local keys; login still passed. Backend build/typecheck/lint and all 39 unit/HTTP tests passed, including key persistence/corruption and development-only startup guards. Optional Redis/storage/scanner and Flutter were outside this startup verification. Disposable test containers, volumes and networks were removed.
