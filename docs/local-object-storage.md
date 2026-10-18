# Local object storage

The owner selected **SeaweedFS Community Edition in Docker** for development on 17 October 2026. This implements the local storage portion of D01; driver entry, upload/scan/attachment APIs, scanner selection, activation and retention rules remain pending. PostgreSQL continues to own application metadata and authorization. Cloudflare R2 is a production recommendation, not a configured or owner-selected production service.

## Start and connect

From the repository root, copy `.env.example` to ignored `.env` without replacing an existing file. If `.env` already exists, add its `SEAWEEDFS_*` entries from the example. Then:

```sh
docker compose --profile storage config --quiet
docker compose --profile storage up -d --wait
docker compose --profile storage ps
```

The `storage` profile starts only SeaweedFS. The existing `dev` and `apps` profiles include it too. The API does not depend on storage or receive unused storage credentials yet; that integration follows with the files module.

| Setting | Development value |
| --- | --- |
| Host S3 endpoint | `http://127.0.0.1:8333` (override host port with `SEAWEEDFS_PORT`) |
| Endpoint from the API container | `http://seaweedfs:8333` on `storage-network` |
| Region for S3 signing | `us-east-1` |
| Addressing | Path style, e.g. `/hired-dev-private/example.txt` |
| Bucket | `SEAWEEDFS_BUCKET`, default `hired-dev-private`, created on startup |
| Credentials | `SEAWEEDFS_ACCESS_KEY_ID` and `SEAWEEDFS_SECRET_ACCESS_KEY` from ignored `.env` |
| Health probe | S3 `/readyz`; signed object operations must be tested separately |

Only the S3 port is published, on loopback. WebDAV, Admin UI and table catalogs are disabled; internal master/filer/volume/control ports are not published. The API is the only other application service on the separate storage bridge and can still reach internal service ports. Portals do not join it. This development topology is not a production isolation boundary. Synthetic files only until the private-file workflow and data policies are implemented.

Signed browser URLs must use a hostname reachable by the browser; Docker's `seaweedfs` hostname is for container-to-container traffic. Changing a signed URL's hostname breaks its signature. Android emulator access likewise needs an explicitly reachable endpoint and matching signature; device validation remains pending.

## Private files and CORS

Both credential variables are required so an empty setting cannot silently start anonymous storage. The configured bucket and objects require signed S3 requests; anonymous readiness probes reveal only service health. No frontend receives the S3 secret. Future file services will authorize ownership/context and clean scan status before issuing short-lived access.

`SEAWEEDFS_ALLOWED_ORIGINS` lists exact development portal origins for the S3 gateway CORS fallback. Add a deliberate origin when changing portal ports. CORS only controls browser access; S3 signatures enforce storage authentication. Bucket-specific CORS, upload limits, quarantine/scan lifecycle and download expiry will be owned by the files integration, not inferred from this local substitute.

## Persistence and lifecycle

`seaweedfs-data` stores both object bytes and SeaweedFS metadata. Stop/start and container recreation keep this named volume. It is not a backup. Keep it when stopping:

```sh
docker compose stop seaweedfs
docker compose --profile storage down
```

Use `up --force-recreate` to apply environment changes. Existing identities can be persisted by SeaweedFS; changing environment values must not be assumed to rotate previously stored credentials. Use deliberate identity management or a separate development project/volume. Do not delete a shared database/storage volume as a credential-reset shortcut. Compose `down --volumes` deletes project data, including any other active services' named volumes.

## Verify the development store

With Docker running, use the saved check (requires Bash and host curl; signed requests use curl supplied by the container):

```sh
bash scripts/check-local-storage.sh
```

Pass Compose global flags for an isolated synthetic project, without changing an existing `.env`:

```sh
SEAWEEDFS_PORT=18333 bash scripts/check-local-storage.sh --env-file .env.example -p hired-storage-check
```

The check starts/recreates only SeaweedFS, writes a unique synthetic object, checks loopback host readiness/access, verifies signed read/write, rejects anonymous read/write and an incorrect signature, verifies denied writes preserve content, and checks persistence after container recreation. It removes its own object afterward and leaves the development service running. It never prints credentials or signed URLs. It does not upload real identity files or prove application authorization/scanning. The `Local storage checks` workflow runs this same check in a disposable project and removes its volumes.

## Version and verification

Pinned `chrislusf/seaweedfs:4.48`, the latest stable release checked on 17 October 2026 (published 28 September, not a prerelease). Sources: [official release](https://github.com/seaweedfs/seaweedfs/releases/tag/4.48), [community project and Apache-2.0 license](https://github.com/seaweedfs/seaweedfs), [mini flags/credential bootstrap](https://github.com/seaweedfs/seaweedfs/blob/4.48/weed/command/mini.go), [S3 health routes](https://github.com/seaweedfs/seaweedfs/blob/4.48/weed/s3api/s3api_server.go).

Storage adapter integration must verify the exact supported operations against SeaweedFS and the chosen production provider; S3 compatibility alone does not prove equivalent behavior. Scanning is a separate service. No backend endpoint or production storage integration is claimed by this setup.

Local author verification on 17 October 2026 passed: storage-only startup/health, both Compose profiles, rejected empty keys/secrets, signed synthetic upload/download, denied anonymous reads/writes and incorrect signatures, unchanged content after denied overwrite, host-loopback access, persistence after forced container recreation, and exact-origin CORS preflights (allowed portal 200; untrusted origin 403 without allow-origin). Only S3 port 8333 was published. Disposable verification resources were removed afterward. Backend/React source and database/API contracts are unchanged; their full suites were not repeated locally for this infrastructure-only increment. Remote workflow results and PR are tracked in the [backend checklist](../backend/todo.md).
