# Driver document access and initial activation — local evidence

Verified 18 October 2026 on `feature/driver-document-access`, following merged PRs #18 and #19. These are author checks with synthetic data; independent review, remote CI and production provider validation remain pending.

## Behavior checked

The browser signs in to the real API as an admin, provisions a pending driver and completes that driver's required password change. A test-only helper inserts a clearly synthetic **previously-clean** PNG into the disposable PostgreSQL/S3 stores. The driver attaches it with a full encrypted number; only `****1234` returns. The admin's existing private preview obtains a freshly authorized five-minute link and fetches actual S3 bytes into a temporary blob URL. The test checks image decoding and close cleanup, then attaches the other three document types and activates with a reason. The saved driver is active and remains offline. No real identity content or fresh scanner verdict is claimed by this fixture. Calendar API integration remains pending; its unavailable state is expected in screenshots.

| Device | Private preview | Saved activation |
| --- | --- | --- |
| Desktop 1440 × 900 | [Preview](desktop-document-preview.png) | [Activation](desktop-driver-activation.png) |
| Mobile 390 × 844 | [Preview](mobile-document-preview.png) | [Activation](mobile-driver-activation.png) |

## Verification

- Backend: build, typecheck, lint, Prisma validation, 45 unit/HTTP tests and 120 PostgreSQL integration tests.
- Real API/PostgreSQL/SeaweedFS: 17 document/activation cases, including signed bytes/CORS/expiration/tampering, scoped access, encryption, replay/rollback, deterministic attachment contention, activation races and database bypass guards.
- Admin: build/lint, 443 unit/component tests, 16 focused intercepted preview checks and 14 activation checks.
- Live browser suite: 10 desktop/mobile cases across authentication, accounts, companies, drivers and documents. Both document cases passed again with the readable PNG shown here.
- Populated upgrades, blank/repeated deployment, empty Prisma-to-database diff; 85-operation OpenAPI/Redocly checks, pinned DBML CLI 10.3.1 export and default/dev/apps Compose validation.
- Compiled Node 26.11.1 image: driver password setup, encrypted attachment/decryption check, operational document reads, five-minute HTTPS link issuance, missing-document activation denial, four-document success, restart replay with exactly one audit and graceful SIGTERM exit 0. Actual signed-byte transport was checked against local SeaweedFS separately; the compiled smoke's synthetic HTTPS signing origin was not a deployed provider.

The concurrent attachment regression first exposed a shared-to-exclusive profile lock upgrade. Taking the final own-profile lock during transaction authentication fixed it; a separate PostgreSQL blocker now forces concurrent requests through the contested path. Both attachment and activation races pass.

## Reproduction

Use explicit disposable `DATABASE_URL`/`TEST_DATABASE_URL`, local SeaweedFS credentials/bucket and exact storage CORS origins. Never point these tests at a real-data database.

```sh
# backend/, after frozen install/generation and disposable database setup
pnpm run test
pnpm run test:integration
pnpm run test:documents:live

# admin-portal/, same disposable database and loopback storage
TEST_DOCUMENTS_LIVE=true PRIVATE_UPLOADS_ENABLED=true \
  pnpm exec playwright test --config playwright.live.config.ts
```

The live browser run also needs `DOCUMENT_NUMBER_ENCRYPTION_KEY` (independent 32-byte base64url key), storage variables and browser-reachable `STORAGE_PUBLIC_ENDPOINT`. See [document policy](../../../backend/documents.md), [upload policy](../../../backend/files.md) and [live-test configuration](../../../admin-portal/playwright.live.config.ts). Host checks used Node 26.5.0 and installed Chrome; production image and CI retain pinned runtime/browser versions. Disposable task containers, network and temporary synthetic key file were removed after validation.

Remaining work: cleanup/replacement/real-data retention and recovery policy, production key custody/providers, Flutter onboarding/device integration, calendar and later status transitions. This slice does not implement orders, trips or financial workflows.

## Merge verification — 21 October 2026

Rechecked the existing implementation before the requested development merge: backend build/typecheck/lint, Prisma validation, 45 unit/HTTP tests, 120 PostgreSQL integration tests, 17 live PostgreSQL/SeaweedFS document cases, admin build/lint, 443 component/unit tests, 30 document/activation browser regressions and all 10 live admin desktop/mobile journeys passed. Blank and repeated deployment and the 85-operation OpenAPI checks passed. The frozen production API image built with its pinned runtime; `/health` and `/ready` returned 200 and SIGTERM exited 0. Host tests used Node 26.5.0 and Chrome.

The disposable OrbStack database required a temporary test-only Compose override with `data-network.internal=false` for host connectivity; repository networking was unchanged. Storage CORS explicitly included both the API test origin and the live browser origin. Initial setup failures were corrected before the successful runs above. The preview fixture remains explicitly previously-clean; fresh ClamAV scanning was not rerun for this attachment/download slice. Remote CI and independent human review are reported separately in the PR.

Merged in [PR #20](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/pull/20) at `ba87d29` on 21 October 2026 at the project owner's request. Backend/frontend/storage CI annotations each report failed account payments or an insufficient spending limit; all three jobs executed zero steps. No CI skip or branch-protection bypass was used. Independent human review remains unverified.
