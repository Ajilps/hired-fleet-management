# Security design

**Status:** implementation requirements and proposed controls, not a security certification. Review this guide with the penetration tester before implementing authentication, authorization, OTP or uploads.

The [OpenAPI contract](api/openapi.yaml) defines each operation's role. This guide explains the data boundaries that must be enforced behind those roles. Product ambiguities remain in the [decision log](decision-log.md).

## 1. Access rules

| Resource/action | Admin | Partner | Driver |
| --- | --- | --- | --- |
| Companies, partner accounts and rates | Manage across companies | Read own company details | No management access |
| Orders | Read/create/decide across companies | Create/read own company | No access |
| Operational trips | Read/manage across companies | Read own company | Read/execute current assignment while operationally active |
| Close-code reveal | No reveal operation | Reveal own-company active trip code | Enter shared code; never retrieve it |
| Expenses | Read | Read own-company trip | Add/edit/delete own entries while current active driver on ongoing trip; confirm combined list |
| Closed reports | Read across companies | Read own company | Read own credited history |
| Identity documents | Operational review | No access | Own documents only |
| Selfies | Operational review | No access | Current active assignment only |
| Receipt downloads | Authorized operational review | Own-company trips | Current-trip or own credited-report receipts |
| Statements | Generate/review/approve/publish under creator/version rules | Read own published statements | No access |
| Earnings | Payroll/report operations only | No access to another driver's wallet | Own credits and total |
| Email/audit metadata | Sanitized admin view | No admin operations | No admin operations |

All admins share the same application role. Creator checks do not create a super-admin role. A driver is not owned by one company.

Authorize each request using role, account state and resource relationship; deny unspecified access. Apply checks to every retry and to rows, counts, totals and attachments. This follows the [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), which calls for least privilege, default denial and permission checks on every request.

Return 404 for resources outside the caller's scope without confirming their existence. Return 403 when the authenticated role/account status cannot use the operation. A hidden button is not authorization.

## 2. Accounts and sessions

- Authenticate through the documented login/refresh contracts. Check active user and session state on protected requests.
- Keep pending-driver onboarding separate from active-driver execution. Active users may read their own credited history even if the driver profile is later inactive/suspended.
- Store password hashes and refresh-token hashes, never raw credentials. Select and review password hashing parameters in DEC-03 before implementation.
- Rotate refresh tokens atomically. Reuse detection revokes the affected session; logout/account disable must prevent further access through it.
- Rate-limit login, refresh, applications, code attempts and file uploads. Limits need explicit values and tests, not only UI timers.
- Keep Flutter refresh credentials in platform secure storage. React access tokens stay in memory. The implemented admin browser transport uses an HttpOnly refresh cookie and explicit origin/custom-header CSRF guards; no local/session-storage credential persistence is added. See [authentication policy](../backend/authentication.md) for implementation and remaining review scope.

The owner selected browser-cookie persistence on 17 October. OpenAPI now distinguishes browser and native transport. Production uses Secure host-only `__Host-hired_refresh` with SameSite=Lax, HttpOnly and Path=/; explicit credentialed CORS and server-validated Origin/custom header accompany browser login/refresh/logout. Cross-site third-party-cookie deployments are unsupported. Independent security review remains required.

Redis is selected for caching, not automatically as the session authority. Sessions versus JWTs is not an either/or security choice: token validation still needs the documented revocation/account checks. If session authority moves to Redis, review expiry, persistence, failover and revocation under DEC-03/30 and update the API/schema/client contracts. Loss of session state may require reauthentication; it must never permit access without validation or restore previously revoked access.

## 3. Close-code protection

The partner receives the plaintext only through the authorized reveal action. The driver supplies the code for closure. No ordinary trip/list/report, email, audit or telemetry response includes it.

Store validation material separately from the encrypted reveal copy, and keep cryptographic keys outside the database/code repository. Because numeric codes have little entropy, the implementation review must address offline guessing, key separation, code lifetime and replacement. Use vetted cryptographic libraries; DEC-04 records the unresolved algorithm/key-management and attempt policy choices.

Use `Cache-Control: no-store` on reveal responses. Clear displayed code on navigation/logout. Do not put it in URLs, screenshots used for public evidence, crash reports or client caches. Six digits is only the current draft format.

Wrong code leaves the trip ongoing and creates no financial records. Count the attempt durably; a replay of the same attempt must not count twice. Limit abuse independently of financial transaction rollback. Respect server lockout/expiry decisions.

## 4. Private-file lifecycle

1. Authenticate the uploader and validate the target driver/trip.
2. Enforce configured size/type limits and inspect content; do not trust filenames or browser MIME alone.
3. Store privately in quarantine and return metadata, not a public URL/storage key.
4. Scan before attachment or download. Rejected/pending content stays unavailable.
5. Attach only when owner, purpose, driver/trip context and clean scan all match.
6. Issue a short-lived download link only after current relationship authorization.

Drivers can inspect their own unattached upload metadata. Signed downloads require authorized attached clean content. Partner receipt access never implies access to identity files or selfies. Reassignment revokes old operational access; existing signed URLs remain usable until expiry unless a revocable proxy is chosen.

Document replacement must retain the previous current upload until the new attachment commits. Mask document numbers in ordinary responses. Decide retention, cleanup, URL lifetime and key recovery before using real documents; see DEC-06/07/22.

## 5. Financial and workflow abuse

| Risk | Required protection | Planned evidence |
| --- | --- | --- |
| Forged company/driver ID | Derive scope from session and check every related ID | QA-02, QA-23 |
| Former driver submits queued changes | Recheck current assignment inside mutation transaction | QA-08, QA-10 |
| Double close/lost response | Durable replay plus permanent payroll/report/credit uniqueness | QA-12 |
| Expense changes after confirmation | Clear confirmation and advance aggregate version atomically | QA-10 |
| Rate edit races closure | Shared company lock; closure-effective rate and exact arithmetic | QA-13 |
| Creator omitted or stale approval used | Lock statement; creator-plus-one-other and matching version | QA-17 |
| File ID swapped across users/trips | Owner/context/relationship checks on attach and download | QA-03, QA-23 |
| Extra fields alter roles/amounts | Strict DTO allowlists; no generic record mass assignment | QA-05, QA-23 |
| Malicious text reaches UI/query | Parameterized database queries and appropriate output escaping | QA-23 |

Prisma-generated TypeScript types do not validate untrusted input or enforce authorization/company scope. Keep runtime DTO allowlists, related-record checks and report validation in services; never pass a request body directly into an ORM create/update. Use parameterized Prisma/SQL queries; specialized SQL must use bound values and reviewed static identifiers. Redact sensitive bound values from query logs and error telemetry.

Closed financial values and snapshots are immutable. External settlement metadata cannot recalculate shares or add wallet credits. Do not add manual-credit/reversal endpoints merely because reserved enum values exist.

For the initial [travel-time estimate](travel-time-estimation.md), accept only validated road distance from intake callers. Derive speed, source, policy and duration on the server, and keep duration overrides admin-only. A rough estimate must not trigger automatic lateness penalties or success classification; its input and calculation evidence remain separate from financial authority.

## 6. Logs, secrets and environments

Record request ID, actor, action, resource identity, time and sanitized outcome. Separate business audit events from service diagnostics. Redact passwords/tokens, code values, document numbers, file bytes, private storage keys and signed URLs from both server and client telemetry.

Use HTTPS for deployed API/portals. Restrict service/database/storage access and give runtime identities only the access they need. Keep development, test, staging and production credentials separate. CORS is a browser policy, not a substitute for authorization. Backend startup must reject missing required secrets without printing them.

The team must select retention/deletion rules and approved incident contacts before collecting real personal data. This document does not claim legal compliance or invent a retention period.

### Docker, Redis and managed PostgreSQL

Use the [infrastructure plan](infrastructure-plan.md) for the selected deployment boundaries. Keep PostgreSQL/Redis credentials in runtime secret storage, with private connectivity and verified TLS as appropriate to the provider. Separate application and migration privileges. Do not expose dependency ports publicly or include secrets in Docker build arguments, layers, images or frontend bundles.

Run app containers with restricted privileges, omit unnecessary development tooling from production images and review pinned base/dependency updates. A container is not a substitute for resource authorization, upload scanning or backup recovery.

Scope private cache keys by the actual authorized company/user and query. Recheck access before returning cached data; caches must not prolong access after reassignment, account disable or membership changes. Do not use cached rates/permissions to authorize financial writes. Cache expiry alone is not an immediate-revocation mechanism.

Keep close codes, credentials, raw identity content and signed file URLs out of ordinary caches. Document Redis access controls, memory/eviction, persistence and outage behavior under DEC-30. Disposable caches and critical session/limiter/queue state need separate workloads when their policies differ.

If Redis is unavailable, a cache can be bypassed. Required session validation or login/OTP abuse limits may only use an agreed secure fallback; otherwise refuse the affected operation. Never treat a dependency timeout as permission to skip authorization or reset durable failed-code attempts. Test these boundaries in QA-28/30.

## 7. Security review and findings

The penetration tester records reproducible cases using synthetic accounts/files. Report exploitable details privately through an admin-approved channel. Public PRs describe behavior and regression evidence without secrets. Full-stack/Flutter reviewers confirm the affected integration; the author does not approve their own PR.

Before pilot: test the access matrix, token reuse/revocation, code abuse, file isolation, malicious input, cache isolation/outages, container/dependency access and sensitive-data leakage; resolve release-blocking findings or obtain an explicit documented team risk decision. The [testing strategy](testing-strategy.md) defines QA-01 through QA-32. No security tests are claimed as passed by writing this guide.

Driver entry policy selected 18 October 2026: admin-only provisioning, restricted initial password and verified mandatory change before business access. Current driver identity derives from its real profile; explicit route role lists preserve admin/partner isolation. Public applications are closed. Driver/file/scanner/activation details and remaining gates are in [driver policy](../backend/drivers.md).
