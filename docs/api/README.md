# HireD API documentation

**Status: Phase 1 contract, version 0.2.0-draft.** The backend now implements infrastructure and admin authentication/migrations and admin company/rate and partner provisioning APIs with replay/audit, partner identity/own-company access and mandatory first-login password change; other business endpoints, driver authentication and partner portal screens remain planned. These documents include the eventual shared API, not a claim that all operations are deployed. See [implemented authentication](../../backend/authentication.md).

The [OpenAPI 3.1 specification](openapi.yaml) is the editable source of truth for HTTP routes, request/response schemas, authentication, errors and examples. [Swagger UI](index.html) renders it locally. The [endpoint reference](endpoint-reference.md) lists all 84 operations, roles and priorities. P1/P2 markers describe proposed rollout scope; they do not override the product requirements.

## View Swagger UI

Use Node.js 22.12 or later for this documentation package and the pnpm version pinned in `package.json` (currently `pnpm@12.10.1`). Node runs the documentation scripts; pnpm installs dependencies and runs package scripts. See [package-manager setup](../developer-setup.md#pnpm-policy-and-bootstrap) for version/bootstrap policy. From the repository root:

```sh
cd docs/api
pnpm install --frozen-lockfile --ignore-scripts
pnpm run start
```

Open **http://127.0.0.1:8080**. Set `DOCS_PORT=8081 pnpm run start` if 8080 is in use. Stop with Ctrl+C. The server binds to loopback and serves only the documentation files and pinned Swagger UI assets. It does not start a backend.

This standalone package uses `pnpm-lock.yaml`, imported from its previous npm lockfile with all four dependency versions and integrity hashes preserved. The former npm lockfile has been removed after a clean frozen install, contract checks and bundle validation; do not regenerate competing lockfiles. `--ignore-scripts` preserves this documentation package's existing no-install-hooks setup. The pnpm pin follows the [stable compatible version policy](../developer-setup.md#dependency-and-version-policy) for this package, not an owner-selected version for unscaffolded applications.

Swagger UI assets are installed locally; no CDN or online validator is used. Request submission is disabled for this mixed implemented/draft API. Before enabling a test environment, update `servers` in `openapi.yaml` and intentionally configure `supportedSubmitMethods` in `swagger-init.js` for a test environment. Authorize with the access token from login. Documentation serving at 8080 and the proposed API at localhost:3000 are separate processes; the API will need its own CORS configuration for browser calls.

Import `openapi.yaml` into an OpenAPI 3.1-capable Swagger Editor, Postman or client generator. For a self-contained JSON representation:

```sh
pnpm run bundle
```

This generates ignored `openapi.json`; edit YAML, not the generated JSON. The immutable trip-report schema is embedded in the specification to make imports self-contained. `pnpm run check` verifies that it still exactly matches the existing canonical JSON Schema after reference relocation.

## Validate changes

```sh
pnpm run check
```

The pinned Redocly CLI validates the OpenAPI document, references, unique operation IDs and request/response/schema examples. Contract regression checks additionally verify snapshot parity, endpoint catalog coverage, role metadata, command preconditions, exact financial/identity reconciliation and heuristic arithmetic/evidence in the published examples. These are documentation checks, not passed backend tests.

Update `endpoint-reference.md` when adding/removing an operation, including its role, priority and operationId. Add examples to changed contracts and retain the source report schema's property spellings. No backend code, database migration or generated SDK is added here.

## Existing project contracts

The specification follows:

- [Application workflows](../workflows.md): state transitions, transaction boundaries and actor responsibilities.
- [Naming conventions](../naming-conventions.md): `/api/v1`, plural kebab-case resources, camelCase JSON and lowercase stored enum values.
- [DBML schema](../database/hired.dbml): canonical entities, fields and enum inventory.
- [Database design](../database/database-design.md): file privacy, expense ownership, closure arithmetic and approval gates.
- [Trip report snapshot](../database/trip-report-snapshot.schema.json): exact immutable version-1 report payload.
- [PRD validation and open decisions](../database/prd-validation.md): confirmed requirements versus proposals.

Paths, DTO envelopes, cursor/header formats and authentication transport are proposed HTTP choices. DBML is not a list of automatically exposed CRUD endpoints. Worker leases, raw audit payloads, OTP storage, identity numbers, password hashes and object-storage keys stay internal.

## Common HTTP conventions

| Item | Contract |
| --- | --- |
| Base path | Every business route includes `/api/v1`; the `servers` URL contains only the origin |
| Authentication | `Authorization: Bearer <accessToken>` except login, token-authenticated refresh and provisional public driver application |
| Ownership | Admin across companies; partner derives one company from membership; driver derives profile identity from session |
| IDs | UUID strings; audit bigint IDs are decimal strings to preserve precision |
| Money | Exact INR decimal strings, such as `"10000.00"`; numeric(12,2), statement/report aggregates numeric(14,2) where specified |
| Percentages | Exact two-decimal strings; positive company rates sum to `"100.00"` |
| Time | RFC 3339 instants with explicit offset; normalize to UTC; calendar availability and billing use Asia/Kolkata |
| Time ranges | Inclusive lower bound, exclusive upper bound; reject reversed/equal ranges and invalid calendars |
| JSON | Strict request DTOs; reject unknown fields and trim/reject whitespace-only required text |
| Pagination | `limit` 1–100, default 25; opaque `cursor`; `pageInfo.nextCursor`, `hasMore`, `totalCount` |
| Collections | `items` plus `pageInfo`; single resources return the typed object directly; errors use `error` |
| Errors | `error.code`, `message`, `requestId`, `details[]`, nullable `retryAfterSeconds` |
| Mutation concurrency | Required `If-Match` where declared; stale → 412, missing → 428; refresh and reapply user intent |
| Retry identity | Required `Idempotency-Key` where declared; reuse only for retry of the same intent/body/path |

Currency is INR. Use decimal arithmetic, not JavaScript `Number`, for payroll. Proposed rounding is half-up to two places for the driver share; company share is the remainder. A zero trip amount and zero trip credit are permitted by the existing design. Expenses require positive amounts and remain separate from the commission split.

List filters are optional unless marked required. Validate each timestamp/date; compare bounds when both are supplied. Query arrays use repeated keys: `?companyIds=<id1>&companyIds=<id2>`. Partners/drivers must omit admin-only identity filters rather than trusting them for authorization. Reject unsupported filters, including attempts to widen scope.

Cursors bind caller, authorization scope, filters and ordering. Ordinary lists sort newest first using the resource time plus unique ID: users/companies/drivers/rates/partners/sessions/notifications by `createdAt`; orders by `createdAt`; trips by `scheduledPickupAt`; reports by `generatedAt`; credits by `createdAt`; payroll by `calculatedAt`; statements by `periodStart`; assignments by `assignedAt`; documents by `uploadedAt`; audit by `createdAt` and numeric audit ID. Availability dates sort ascending by date. Do not let pagination change whole-range counts/totals. Concurrent changes can shift a live result; no point-in-time report export is promised.

The expense list is intentionally complete and unpaginated for final confirmation. Statement detail returns all immutable lines, while the statement list is paginated. Large-statement transport/export limits need an implementation capacity decision before deployment.

## Authentication and access

The selected [infrastructure direction](../infrastructure-plan.md) includes Docker, managed PostgreSQL and optional scoped Redis caching. Authentication uses PostgreSQL session and abuse-control state, not Redis.

Native transport defaults to JSON access/refresh credentials. Browser clients send `transport: browser`, exact allowed Origin and `X-CSRF-Guard: 1`; access-only JSON is returned and the refresh credential lives in a host-only HttpOnly SameSite=Lax cookie (Secure `__Host-` prefix in production). Browser refresh sends only `{transport: browser}` and that cookie/guard. Rotation is atomic; recognized consumed-token reuse revokes the session. Only hashes persist. Access validation checks current session/account state as well as signature. Browser/API deployment must be same-site, with HTTPS in deployment; CORS explicitly permits credentials to reviewed origins.

For Flutter, keep refresh credentials in platform secure storage when those domain accounts are integrated. React access tokens remain in memory; startup/expiry restoration uses the cookie without exposing it to JavaScript. The admin slice uses 15-minute access and seven-day absolute refresh defaults, configurable within bounded limits. [Authentication policy](../../backend/authentication.md) records hashing, rate limits, bootstrap, origin/CSRF and lost-response behavior. Partner authentication is implemented with current company membership and a mandatory first-login password change. Driver authentication remains unavailable until its domain integration; do not treat planned role metadata as implementation evidence.

Pending drivers may sign in, read their own profile/documents and upload/attach onboarding documents. Pending/inactive/suspended drivers cannot read/write operational trips or change availability. An active user may still read their own historical credited trips/reports/earnings. Active driver profile plus active user account is required for assignment and execution. Availability does not replace activation and is separate from network connectivity. An inactive user cannot authenticate or use an existing session.

`x-roles` is review metadata, not an executable authorization engine. Reauthorize every request and replay. Return 404 for absent or out-of-scope resources and 403 for an otherwise authenticated role/status that cannot use an operation. Scope rows, counts, totals and files consistently. Do not expose an old driver's current-trip access merely because they appear in assignment history. Keep the recorded payroll driver's read access to their completed history.

## Idempotency and concurrent changes

Use an opaque UUID or equivalent string for each logical command's `Idempotency-Key`. Scope the registry by actor, HTTP method and canonical path. Persist a keyed normalized request fingerprint and completed safe response; include the uploaded file digest for multipart requests. Reusing the key with different input returns 409 `IDEMPOTENCY_KEY_REUSED`. Serialize in-flight duplicates; return 409 `COMMAND_IN_PROGRESS` with retry guidance until the stored result is available.

Authenticate/authorize first, then look up a replay, then check preconditions for a new command. The internal [command foundation](../../backend/commands.md) now retains successful and explicitly committed safe-denial results for 25 hours, exceeding the 24-hour minimum. Its PostgreSQL registry and audit are represented in DBML/migrations. Business endpoints must still consume and verify this boundary as they land. The fingerprint includes the original If-Match value: retries preserve their original key/body/precondition; a new intent uses a new key. Permanent unique domain rules protect trip/payroll/report/credit and notification intents beyond that window.

A strong trip ETag represents the aggregate: assignment, saved expense list, confirmation and operational trip state. Expense changes must advance this tag even though expense rows are separate tables. Read it from trip detail or the complete expense list, and use it for the next command. Every trip mutation response returns its new aggregate ETag. Order ETags cover order decisions/overrides. A statement uses explicit `contentVersion` in each command body.

For closure, an interrupted response is not permission to show success or infer rollback. Repeat the same key/body. The active recorded payroll driver receives the persisted result for an already closed trip, even after the code has been consumed or the old ETag has become stale; no second credit occurs. A wrong-code attempt returns 422 `INVALID_CLOSE_CODE`, leaves the trip ongoing and durably records the failed attempt. Retrying that same attempt must not increment twice; a newly entered code is a new intent/key. Server expiry/lockout may return 409 `CLOSE_CODE_EXPIRED` or 429 `CLOSE_CODE_LOCKED` with `Retry-After`.

Starting, confirming expenses and closing require an online server response. Local drafts are not saved expenses. Confirm with `hasNoExpenses: true` only for an empty list, or `false` for a nonempty list. Confirmation uses the latest aggregate ETag. Any expense mutation/reassignment clears both confirmation fields. Only the original submitter who remains the current active driver may edit/delete an expense; replacement drivers review retained entries and reconfirm them.

## Travel-time estimates

The initial build uses optional manually supplied `routeDistanceKm` and a server-configured speed/policy to produce a labelled `distance_heuristic`. It needs no routing provider. Missing distance/policy produces unavailable status, while an admin override can still provide minutes. Invalid supplied distance is rejected; the caller cannot set speed/source/policy. See [estimation design](../travel-time-estimation.md).

`Estimate.source` and the frozen report estimate now allow `distance_heuristic`, `maps`, `admin_override` or NULL. Heuristic results require `heuristic` evidence containing positive fixed-two-decimal distance/speed strings and policy version. Nonheuristic results omit that field or use NULL. Clearing an override restores the stored automatic basis or unavailable. Acceptance copies it; closure freezes it. No new endpoint is introduced.

Version `0.2.0-draft` expands the source enum and optional distance/basis fields. Update strict generated clients and the UI contract together. The version-1 snapshot is still a preimplementation draft; old maps/admin/unavailable examples remain valid. Later provider integration must define provenance, traffic basis and storage rules before exposing new fields. The heuristic does not complete PRD B-04's maps-based P1 requirement.

## Private files

Upload with `multipart/form-data` to `/file-assets`, then poll the metadata until `scanStatus` is `clean`. A 201 upload response is not proof that the asset is safe to attach. Proposed upload types are PDF/JPEG/PNG for documents/receipts and JPEG/PNG for selfies, with a 10 MiB maximum. Enforce content detection, limits, quarantine and scan server-side. These limits are proposals, not PRD-mandated values.

Upload purpose/context must be validated and durably associated with the asset by the storage/service implementation; the current file_assets table does not contain those context fields. Driver-document uploads belong to the authenticated driver; admin uploads must name the target driver. Trip media requires the current active assignment. Attaching a file rechecks owner, purpose, trip/driver context and clean scan. Reject cross-trip or cross-user attachments.

Private download-link issuance checks the current attachment relationship. Partners can read own-company receipts, never identity documents/selfies. Drivers can read own documents, current-trip media and receipts in their credited closed reports. Prior assignment alone does not grant new media access. Admin reviews operational files. Only metadata is exposed on ordinary responses; document numbers are masked.

Download links and code/token responses use `Cache-Control: no-store`. Signed URL expiry bounds revocation; do not promise instantaneous revocation of an already issued URL without a proxy. Unattached upload retention/cleanup and scan provider are implementation decisions. Do not place storage keys or signed URLs in the immutable report.

## Statement lifecycle

Generate one draft per company/completed calendar month using actual trip closure time in Asia/Kolkata. The period end is exclusive. Copy the immutable payroll rates/shares into each line; expenses do not inflate totals. Creator-only regeneration replaces lines/totals and increments contentVersion while still draft.

Creator submits the reviewed version, freezing content. Submission/creation is not approval. The creator and exactly one distinct noncreator admin approve the same contentVersion, in either order. Two noncreators cannot substitute for the creator; a third distinct approver conflicts. The server sets verified only once that pair exists. Any admin may publish after rechecking the pair/version. Publication and its email intent commit together. A delivery failure does not hide or revert a published statement.

Partner visibility is published-only under the working policy. No submitted revision, void, dispute workflow or creator-unavailability override is introduced. Payroll `partnerPaymentStatus` records external settlement/dispute metadata separately; it never changes a report's `paymentStatusAtClosure`, frozen totals or driver credit.

## Seven admin reports

All seven endpoints take required `from`/`to` instants and optional repeated `companyIds`; omission means all companies. Relevant endpoints also accept admin `driverId`. Full-range `totals` and `pageInfo.totalCount` are computed before pagination from the same scope. `range.dateBasis` explains the actual timestamp basis. `range.companyIds` contains the resolved selected IDs.

| Report | Time basis and interpretation | Stable row order |
| --- | --- | --- |
| Billing issues | Statements whose periodStart local midnight is in range; also reconcile payroll/trips closed in range for missing records/lines | companyId, nullable statementId, nullable tripId, issueType ascending |
| Driver delays | Scheduled pickup range; provisional actual-start minus scheduled-start seconds, zero grace; null start remains not_started | scheduledPickupAt, tripId descending |
| Client volumes | Order counts by creation; started/on-time-start metrics from trips scheduled in range | companyId ascending |
| Driver payouts | Payroll calculatedAt, equal to closure time; group by driver/company and reconcile credits | driverId, companyId ascending |
| Trips | live means ongoing with scheduled basis; daily/monthly completed uses closedAt, operational uses scheduledPickupAt | selected timestamp, tripId descending |
| Orders | Order creation time and current outcome | createdAt, orderId descending |
| Driver/staff work | Assignment/replacement counts by assignedAt; completion count by closedAt | driverId, companyId ascending |

For trips, daily/monthly mode labels a trip-level result rather than returning grouped buckets. Daily selects one local calendar day and monthly one local calendar month; the server validates local-midnight boundaries. Live requires `view=operational` and returns fetched ongoing trips, with no GPS/push guarantee. Clients refresh explicitly.

Provisional acceptance percentage is accepted orders divided by all created orders, including undecided received orders. On-time-start percentage uses started trips as denominator and a zero-grace rule. A zero denominator returns null, not zero. These are named metrics with separate denominators; they do not establish the undefined product measure of on-time delivery success. Missing starts/estimates are never silently classified as successful or delayed. Billing issue amounts use nullable expected/actual values when a source record is missing. Report access requires no separate approval.

## Proposed policies requiring team decisions

Operation `x-policy-decisions` values refer to these choices:

| Key | Working contract |
| --- | --- |
| public-driver-registration | Public application endpoint creates pending profile; invitation-only deployments disable it |
| four-document-activation-gate | Current clean licence/aadhar/PAN/PCC before operational activation; no formal identity verification |
| last-active-admin-safeguard | Owner-selected and implemented: protect the final enabled admin who completed password setup; restricted admins do not count. Initial bootstrap remains operational |
| company-deactivation-policy | Stop new intake while preserving history and existing-trip execution |
| upload-allowlist-and-10-mib-limit | Type allowlist/10 MiB maximum, quarantine before attachment |
| pre-close-reassignment | Assigned/ongoing only; closed-trip finances remain immutable |
| closing-driver-receives-entire-share | Whole credit goes to driver at closure; contribution splitting undefined |
| optional-selfie-gate | P1 selfie is optional; mandatory-before-start remains unresolved |
| six-digit-close-code | Exactly six decimal digits for input/reveal in this draft |
| expiry-and-lockout-policy | Server defines limits/timers; no regenerate-code endpoint until policy exists |
| explicit-empty-expense-confirmation | Explicit no-expense confirmation satisfies the closure gate |
| half-up-rounding | Round driver share half up to cents; company gets remainder |
| expense-exclusion | Report-only expenses do not alter split; reimbursement unresolved |
| published-only-partner-access | Verified alone is insufficient for partner access in the working lifecycle |
| completed-month-statement-basis | Closed trips, local calendar month, completed months only |
| report-metric-and-date-bases | Proposed timestamp bases, live meaning and zero-grace start metrics |
| manual-notification-retry | Admin requeues failed existing intent; worker retains attempts/deduplication |

Authentication token transport, TTLs, password policy, business-command integration/cleanup, signed-link duration, scan infrastructure and large-result limits are additional implementation choices above. Mark changes to these as contract revisions and update consumers. Reserved DB enum values are not new product actions: wallet adjustment/reversal, push/in-app notifications and statement void have no MVP endpoints.

## Scope excluded from this API

There are no driver accept/reject, live location, public document, formal document-verification, payment gateway, withdrawal, manual wallet-credit, score/streak administration or closed-financial editing endpoints. Notifications are transactional outbox intents; worker claim/lease/provider APIs stay internal. Required acceptance/rejection/publication email creation remains part of the corresponding P0 business transitions even though admin delivery-monitoring pages are P1.

## Standards references

This documentation uses [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0.html) for JSON Schema-compatible HTTP contracts and the official [Swagger UI installation](https://swagger.io/docs/open-source-tools/swagger-ui/usage/installation/) and [configuration](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/) guidance for rendering local assets. Project requirements above come from the linked BASAP artifacts; the standards references do not establish HireD product policy.

Partner accounts are now implemented: admin list/provisioning commits the user, membership, safe audit and replay together. Initial passwords preserve bytes and require 15–128 characters. The owner selected mandatory first-login change: `User.passwordChangeRequired` is public identity metadata, and restricted sessions can use identity/session actions plus `POST /users/me/password`; company workflows return `403 PASSWORD_CHANGE_REQUIRED`. A successful verified change revokes all sessions, clears browser cookies and requires a new login. Own-company reads derive scope from current membership; other company IDs return 404. Partner portal/password-change screens and driver integration remain separate client work. See [policy](../../backend/partners.md).

C10 account management is now implemented: safe account list/detail, restricted admin creation and serialized enable/disable with the owner-selected last-usable-admin safeguard. The admin portal now completes mandatory first-login password change and fresh sign-in. Initial admin credentials require 15–128 characters; the full account-management UI and partner portal screens remain separate. See [account policy](../../backend/accounts.md).
