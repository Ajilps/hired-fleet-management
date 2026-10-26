# Driver documents, private access and initial activation

Implemented locally on 18 October 2026 on `feature/driver-document-access`, following merged upload/scanning PR #18 and Docker setup PR #19. This slice completes document persistence, attachment/listing, five-minute download links and initial driver activation. Independent review, remote CI, real-data retention/recovery and deployed provider validation remain separate gates.

## Selected policy

The owner selected retaining **full document numbers encrypted** and requiring an **enabled account plus all four current clean documents** for initial activation: `driving_license`, `aadhar`, `pan`, `pcc`. Existing PDF/JPEG/PNG, 5 MiB, ClamAV and five-minute-link choices remain unchanged. Activation grants operational eligibility; it does not formally verify identity. This slice adds no override or expired-document policy. Cleanup, replacement/real-data retention and production provider/key custody remain open; use synthetic fixtures until those release gates are resolved.

## Attachment and lists

- `POST /api/v1/drivers/me/documents`: password-complete pending/active drivers attach their own clean `driver_document` assets. Strict input accepts `documentType`, `fileAssetId`, optional `documentNumber` and optional `expiresOn`. Browser sessions require an allowed exact Origin and `X-CSRF-Guard: 1`. `Idempotency-Key` is required.
- A driver cannot attach another driver's asset or an admin upload. There is no implicit uploader handoff. Admin uploads remain private uploader metadata until an explicit handoff policy/API is delivered.
- One current document per driver/type and one attachment per asset are protected by database unique indexes. Triggers independently check owner/target/purpose/clean scan, retain history and preserve encrypted identity. Current documents may become historical in a later replacement workflow; replacement APIs remain P2 and unimplemented.
- Writes use the existing atomic command/audit/replay transaction. The executor stays admin-only by default; this consumer explicitly allows drivers and takes the final own-profile lock strength during authentication, avoiding shared-to-exclusive lock upgrades. Current authorization is checked before replay. HMAC request fingerprints retain neither plaintext numbers nor request bodies.
- `GET /api/v1/drivers/me/documents` is driver-only; `GET /api/v1/drivers/:driverId/documents` is admin-only. Lists accept `limit`, `cursor` and optional strict `isCurrent=true|false`. Signed cursors bind actor/driver/filter/collection and preserve PostgreSQL timestamp microseconds. A repeatable-read snapshot provides full filtered totals, stable ordering and empty/history semantics.

## Full-number protection

Numbers are optional, trimmed, nonempty and bounded to 100 characters without control characters. AES-256-GCM uses a fresh 96-bit nonce and 128-bit tag per write. Authenticated associated data binds the version, key ID, document ID, driver ID, document type and asset ID, so ciphertext cannot be moved to another document/context. PostgreSQL stores a versioned ciphertext envelope, key ID and safe masked projection; it never stores a plaintext full-number column.

Ordinary reads select only safe fields and expose `****` plus the last four characters for numbers longer than four characters; shorter numbers expose only `****`. Raw numbers, ciphertext and key IDs are excluded from HTTP projections, logs, audit and command results. No HTTP endpoint decrypts or reveals full numbers. An internal recovery helper authenticates ciphertext and supports an explicitly configured key ring; it is not a public HTTP operation or a rotation/re-encryption job.

| Variable | Purpose |
| --- | --- |
| `DOCUMENT_NUMBER_ENCRYPTION_KEY` | Independent 32-byte base64url active AES key; must differ from authentication/replay keys |
| `DOCUMENT_NUMBER_KEY_ID` | Active key identifier, default `local-v1`; never reuse an ID for different key bytes |
| `DOCUMENT_NUMBER_PREVIOUS_KEYS` | Optional JSON map of up to ten previous IDs to 32-byte base64url keys |

If no key is configured, number-free attachment/listing still works; a supplied number receives sanitized 503. Invalid or reused key configuration fails startup without printing values. Rotation means a new active ID/key plus retained previous keys; preserve key custody with backups. Do not remove keys needed for retained encrypted records. Automated rotation and retention are not claimed.

Local Compose generates the independent document key in `backend-local-state/document-key.json`, separately from existing `keys.json`. An older two-key volume upgrades without rotating authentication/replay keys. `.env` can explicitly override the key and ID. Host-run/production APIs require their own injected key; they never generate it automatically.

## Private metadata and downloads

Uploader-only metadata access remains for unattached assets. A current attached document additionally grants metadata access to operational admins and its owning driver; partners/foreign drivers receive 404. Being an uploader or naming a target driver does not itself permit download.

`POST /api/v1/file-assets/:assetId/download-links` requires fresh enabled/password-complete session and current clean document attachment. Admins have operational access; drivers have own-document access. Unattached, historical, pending, rejected and out-of-scope assets receive 404. Browser sessions require exact allowed Origin and `X-CSRF-Guard: 1`; body must be absent or `{}`. Durable admission is 60 attempts per minute per authenticated user and survives API instances. Account/session and current attachment/asset locks are held through authorization, signing and access-audit commit. Audit failure returns no URL.

The AWS v3 presigner issues a GET URL for exactly 300 seconds, with signed MIME, inline disposition and `Cache-Control: no-store` overrides. Issuance is audited without saving the URL; links are not stored in command replay. Already issued bearer links remain usable until expiry, even if a session/account changes afterward. Identity-document access is not inferred from a trip/partner role; trip-media issuance remains pending.

`STORAGE_ENDPOINT` is the server S3 origin; optional `STORAGE_PUBLIC_ENDPOINT` is the browser-reachable signing origin. Configure the public origin before signing; never rewrite signed hosts. Compose uses internal `http://seaweedfs:8333` and external `http://localhost:${SEAWEEDFS_PORT}`. Production origins require HTTPS; development HTTP is restricted to explicit local endpoints. Signed download support is configured with opt-in private uploads/storage. Metadata/listing remain usable during a storage outage.

The admin preview sends the browser guard, obtains fresh authorized metadata/link, fetches storage without API credentials or referrer, creates a temporary blob URL and cleans it up on close/session loss. Production accepts HTTPS; Vite development additionally accepts loopback HTTP for local storage. Existing preview and activation UI consumes real endpoints; Flutter first-login/upload/attachment integration remains pending.

## Initial activation

`PATCH /api/v1/drivers/:driverId/status` currently supports only `{ "status": "active", "reason": "..." }` for initial activation. Reason is required and bounded to 500 characters. Other operational status transitions remain pending. Admin authorization, `Idempotency-Key` and browser Origin/CSRF guards are required; no undeclared version header is introduced.

The transaction locks the target enabled account and pending profile, then all four current clean attachments/assets. It commits status, first activation actor/time, reason/audit and replay together. Database triggers independently enforce the same activation completeness/account gate and preserve the original activation actor/time forever. Duplicate different intents conflict; identical authorized retries return the original result without repeating the audit. Audit failure rolls back status and replay. Online status and availability are not changed.

## Verification and limits

Tests cover populated/blank/repeated migrations, schema diff, encrypted round-trip and context/tamper/key swaps, masked projections, denied ownership and role access, cursor ties/scope, duplicate/concurrent attachment, browser guards, disable/revocation, admission, activation races and audit rollback. Real SeaweedFS tests verify signed bytes, CORS, expiration and tampering. Live desktop/mobile browser tests preview a synthetic previously-clean image and activate only after four clean attachments; the fixture is explicitly a prior clean scan and does not claim a fresh ClamAV verdict. Existing upload/scanner tests remain separate.

Run `pnpm run test`, `pnpm run test:integration`, and `pnpm run test:documents:live` with explicit disposable database and loopback storage settings. Live browser coverage is enabled by `TEST_DOCUMENTS_LIVE=true`, `PRIVATE_UPLOADS_ENABLED=true`, matching storage/key configuration and the usual disposable admin live-test database. See [todo](todo.md) for exact completed evidence. New dependency `@aws-sdk/s3-request-presigner` 3.1152.0 matches the existing SDK and official stable npm tag/Node >=20 compatibility checked on 18 October 2026.

References: [AWS presigner](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/), [Node authenticated encryption](https://nodejs.org/api/crypto.html), [file uploads](files.md), [driver foundation](drivers.md), [OpenAPI](../docs/api/openapi.yaml).
