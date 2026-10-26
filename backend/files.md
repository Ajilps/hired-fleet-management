# Private driver-document uploads

Updated 18 October 2026. This M3 slice implements D02-assets and D04: opt-in byte uploads, private storage, content inspection, durable recovery, ClamAV scanning and uploader-only metadata. Document attachment/listing, encrypted full numbers, signed downloads and initial activation are now implemented in [document policy](documents.md). Flutter/admin upload screens and cleanup/retention remain separate tasks.

## Selected policy and scope

The owner selected **PDF/JPEG/PNG, maximum 5 MiB**, **ClamAV in Docker with a clean scan required before attachment/download**, and **five-minute signed links**. [DEC-06/07](../docs/decision-log.md) retain unimplemented trip-media rules, abandoned-upload cleanup, replacement retention and [DEC-22](../docs/decision-log.md) personal-data/backup retention as open. Five-minute issuance is implemented in D06 under the current attachment checks in [document policy](documents.md).

Only `purpose=driver_document` is implemented. Password-complete drivers with pending/active profiles upload for themselves and must omit `driverId`; admins name an existing target profile. Partners and restricted credentials cannot upload. Trip contexts, scope/status/scan fields and duplicate/unknown multipart fields are rejected. An admin upload remains owned by that uploader; the current driver-only attachment command rejects it. An admin-to-driver handoff needs a later explicit policy/API. No implicit cross-owner attachment is introduced.

Use synthetic documents until cleanup/retention and deployed providers are agreed. `PRIVATE_UPLOADS_ENABLED` defaults to false. Enabling it requires explicit storage credentials and a scanner; there is no configuration that substitutes an always-clean scanner.

## HTTP behavior

`POST /api/v1/file-assets` requires a bearer session and `Idempotency-Key` (1–100 ASCII letters/digits/colon/underscore/hyphen). Send exactly one `file`, one `purpose=driver_document`, and `driverId` for admins. Browser sessions also require a configured exact Origin and `X-CSRF-Guard: 1`; native bearer sessions use their existing token transport.

- 201 returns the safe FileAsset DTO with `scanStatus=clean` and a metadata Location. Bytes remain private quarantine objects even after a clean scan; no attachment/download is implied.
- 413 rejects empty files and files above **5242880 bytes**. Exact 5 MiB is allowed. Multipart overhead is capped at another 16 KiB; fields and body arrival are bounded, with a ten-second arrival deadline (408).
- 415 rejects unsupported byte signatures; 422 rejects invalid context/fields/filenames or terminal `FILE_REJECTED`. MIME headers and filename extensions do not override byte inspection. Signature detection is best effort format recognition, not full document verification or proof that a file is harmless.
- 409 rejects changed input under a used key or an active/expired fenced claim requiring retry. 503 reports storage/scanner/capacity failures with retry guidance. A pending asset is never promoted to clean on an outage.
- Admission defaults to **12 attempts per minute per authenticated user**, including retries and invalid bodies. `FILE_UPLOAD_ATTEMPTS_PER_MINUTE` accepts 1–100. Durable HMAC buckets share the existing `auth_rate_limits` table via the shared admission helper; they commit outside workflow transactions. Four simultaneous body/scan workflows per API process bound memory; additional requests receive 503. No Redis is needed.

`GET /api/v1/file-assets/:assetId` rechecks current session/account/password setup and allows the uploader, with matching own-driver context for drivers. A current attachment additionally grants metadata access to operational admins and its owning driver under [document policy](documents.md). Partners, unrelated drivers and other admins for unattached assets receive the same 404 as an absent ID. A target driver cannot access an unattached admin upload. Pending/rejected metadata is readable by its uploader. Returned fields are exactly id, filename, detected MIME, size, SHA-256, scanStatus, uploader ID and createdAt. Storage keys, intent/lease fields and object bytes stay internal. All responses use `Cache-Control: no-store`.

## Durable external-write boundary

Uploads use a purpose-specific `file_upload_intents` registry because S3 and PostgreSQL cannot share a database transaction. Upload intents use their own boundary; ordinary commands remain admin-only by default. The document attachment consumer now explicitly opts into driver authorization.

1. Authenticate before parsing bytes; enforce admission, strict context and size/signature checks. Reserve an immutable FileAsset, HMAC intent and 60-second random lease plus minimal append-only audit in one short transaction. Actor/key scope represents the fixed POST `/file-assets` operation.
2. PUT privately with a server-generated `quarantine/<asset UUID>` key, SHA-256 transport checksum, `application/octet-stream`, `no-store` and `If-None-Match: *`. No public ACL or client storage key is accepted. No object write precedes durable reservation.
3. If a previous PUT may have succeeded, conditional overwrite fails; bounded authenticated read and SHA-256 verification reconcile the existing immutable object. Scan the matching bytes through ClamAV.
4. Reauthenticate and recheck driver eligibility, lock the intent, verify the lease token/expiry, then atomically store clean/rejected scan state, completion and minimal audit. Clear the lease. No object I/O runs under database locks.

Completed retries derive the original stable response from immutable metadata; rejection also replays without another scan. Changed bytes/name/context conflict. Upload keys remain retained until cleanup is selected, exceeding the command foundation's 25-hour minimum; do not recycle keys. Keep `COMMAND_FINGERPRINT_KEY` stable for retained intents. Key rotation needs a versioned-key migration or agreed registry expiry/recovery policy before production rollout. Account/session authorization is required for every replay. A scanner verdict is terminal for this workflow; rescan/replacement requires a later explicit policy.

After response loss, process death or an outage, retry **the same key, filename, context and exact bytes**. Live claims return 409; abandoned claims can be acquired after 60 seconds. A late worker cannot overwrite a newer verdict. Storage operations and scanner VERSION/INSTREAM are each bounded at ten seconds, leaving transaction/queue margin within the 60-second claim. A failed final audit rolls back metadata/completion while leaving a tracked private object for retry. Best-effort lease release accelerates retries; its failure cannot erase durable recovery. Never delete an object merely because a database commit/HTTP response is uncertain.

This is a synchronous request workflow: there is no background scan queue. Pending work resumes only on an authenticated retry; polling metadata alone does not restart it. Reserved rows without bytes and stored pending/rejected objects remain traceable, private and retained. No automatic cleanup is claimed before DEC-07/22; operational monitoring/cleanup and real-data retention remain rollout gates.

## Local services and configuration

Start dependencies from the repository root, using your ignored `.env`:

```sh
docker compose --profile storage --profile scanner up -d --wait seaweedfs clamav
```

For a host API, copy the private-storage/scanner section of `.env.example` into ignored `backend/.env.dev` and set `PRIVATE_UPLOADS_ENABLED=true`. Defaults: host S3 `http://127.0.0.1:8333`, signing region `us-east-1`, path-style bucket `hired-dev-private`; scanner `127.0.0.1:3310`. Compose supplies API-container endpoints `seaweedfs:8333` and `clamav:3310`. API credentials remain server-side. HTTPS is required for production S3 endpoints; development HTTP is restricted to loopback or the explicit SeaweedFS service name. This is not a selected production provider configuration.

Both service ports are published to host loopback only. Separate storage/scanner bridges include the API; portals cannot connect to internal dependency endpoints. Clamd TCP is unauthenticated: do not expose it publicly. ClamAV retains outbound access for Freshclam updates and uses a persistent signatures volume; uploaded bytes never enter that volume. Budget **4 GiB** for scanner signature loading. The official 1.5.4 image currently publishes amd64 only, so Compose explicitly uses Docker emulation on Apple Silicon and native amd64 on CI. Initial startup/signature refresh can take time.

The checked-in clamd configuration bounds queue/threads, stream/file size, expansion, recursion and file count, and alerts on encrypted content or exceeded scan limits. The client uses bounded `VERSION` + `INSTREAM` TCP requests, rejects signatures older than 72 hours or implausibly future-dated, and accepts only a complete exact clean reply. Found signatures produce rejection; protocol errors, stale/missing signatures, oversized replies, EOF and timeouts fail closed. Provider details and signature names are excluded from API responses, application audit and application logs; daemon diagnostics may record stream verdicts. Readiness remains database-schema readiness; a scanner/storage outage rejects uploads while auth/metadata continue working.

## Versions and verification

Selected under DEC-37 on 18 October 2026: AWS SDK `@aws-sdk/client-s3` **3.1152.0** (Node >=20), Busboy **1.6.0** (Node >=10.16), `@types/busboy` **1.5.5**, `file-type` **22.2.0** (Node >=22), ClamAV **1.5.4**, official image digest `sha256:638d90201ee7ee6a82d249a2fc23b132e578673b5f1f2766852b127676ca1ef6`. Registry stable tags/engine metadata and Docker manifests were checked; exact pins/lockfile are committed. Existing dependencies are unchanged.

Primary references: [AWS v3 S3 examples](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html), [AWS SDK releases](https://github.com/aws/aws-sdk-js-v3/releases), [Busboy limits](https://github.com/mscdex/busboy), [file-type format-recognition limits](https://github.com/sindresorhus/file-type), [ClamAV stable release](https://github.com/Cisco-Talos/clamav/releases/tag/clamav-1.5.4), [Docker/signature/RAM guidance](https://docs.clamav.net/manual/Installing/Docker.html), [Clamd protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html).

Run backend build/typecheck/lint/unit/PostgreSQL checks as documented in README. `pnpm run test:storage` requires explicit loopback `TEST_STORAGE_ENDPOINT` and the storage variables; it creates and deletes only its own unique synthetic objects. `pnpm run test:files:live` additionally requires disposable `TEST_DATABASE_URL`, matching storage variables and loopback ClamAV. It creates/drops its own child database and deletes only its generated objects. No inherited production endpoint is accepted. Fault injection is constructor-based in tests; production has no scanner bypass.

The storage CI workflow runs `node --import tsx scripts/wait-for-scanner.ts` before live uploads. It waits up to three minutes for the actual upload scanner client to accept current signatures and scan a synthetic document. A successful container ping alone can precede Freshclam's initial signature reload. Failures retain the scanner's bounded diagnostic logs; stale signatures still reject uploads.

Local evidence and PR/CI state are maintained in [todo.md](todo.md). Independent full-stack, Flutter contract and penetration-tester review remain required; author checks do not supply those approvals.
