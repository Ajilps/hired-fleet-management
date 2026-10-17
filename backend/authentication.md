# Admin and partner authentication

Implemented slice, 17 October 2026. This is the first full business module in the modular monolith: routes → controllers/validators → service → repository → Prisma/PostgreSQL. `app.ts` composes the router through the module's public `index.ts`. The operational CLI uses the same public module boundary.

## Scope and policy

The owner selected browser sign-in persistence through an HttpOnly refresh cookie. This implementation supports **admins and company-scoped partners**. The owner selected mandatory first-login change for provisioned partners; [partner policy](partners.md) records restricted sessions, the password-change endpoint and current membership-derived authorization. Driver identity integration remains M3; unsupported or missing identity scope receives 403.

Technical defaults below are the implementation baseline for independent security review, not production/pilot certification. They cover admin bootstrap and the owner-selected partner first-login policy under DEC-03. Administrative provisioning/status and its client password-change flow remain C10 work; recovery/invitation delivery and independent review remain separate.

| Area | Implemented behavior |
| --- | --- |
| Identifiers | Email validated and lowercased; migration normalizes legacy values and adds a CHECK. Case-colliding legacy rows cause deployment to fail for explicit reconciliation, never account merging |
| Bootstrap password | Operator supplies a unique 15–128-character password through `ADMIN_BOOTSTRAP_PASSWORD`; no shared default, automatic account update or public admin-registration route. Spaces are preserved; no composition rule |
| Password hashing | Argon2id, 19 MiB, 2 iterations, parallelism 1; random salts. At most four concurrent hash/verify operations per process; overload refuses work instead of growing a queue |
| Access credential | `jose` HS256 JWT, 15-minute default, explicit issuer/audience/algorithm/expiry, user/session IDs only. Every protected operation rechecks the current session and enabled account, password restriction and current company membership in PostgreSQL |
| Signing key | Required random 32-byte base64url `AUTH_SESSION_KEY`; no default. Replacement invalidates existing access JWTs. Use a controlled rotation/re-authentication procedure; key-ring rollover is not implemented |
| Refresh credential | Session UUID plus 256 random bits. Only SHA-256 hashes persist; absolute seven-day default expiry, not sliding. Each successful refresh rotates under a session-row lock |
| Reuse | Consumed hashes retained for the session lifetime. Recognized consumed-token reuse commits session revocation before returning 401; all issued access JWTs then fail the session check. Arbitrary forged secrets cannot revoke a session |
| Browser cookie | Production: `__Host-hired_refresh; Secure; HttpOnly; SameSite=Lax; Path=/`, no Domain. Local HTTP: `hired_refresh; HttpOnly; SameSite=Lax; Path=/api/v1/auth-sessions`. Cleared with matching attributes |
| CSRF | Browser login/refresh/logout/password change require exact allowlisted `Origin` and `X-CSRF-Guard: 1`. Refresh/logout use JSON browser mode. Custom headers require preflight; exact credentialed CORS plus server origin/header validation is enforced independently of the preflight |
| Native mode | Default `transport: token` preserves JSON refresh issuance/request shape. A browser session cannot be rotated through native mode. Partner identity transport is tested; driver/mobile workflows remain unimplemented |

Browser/API hosts must be **same-site**, with HTTPS in deployment, e.g. `admin.example.test` and `api.example.test`. Cross-site third-party-cookie deployment is unsupported by this Lax policy. For local use, use the same hostname consistently (`localhost` or `127.0.0.1`) and allow the exact portal origin; ports may differ. Reverse proxies must preserve the original Origin and cookie headers. CORS permits credentials only to the configured origins, never `*`.

## Endpoints and browser lifecycle

- `POST /api/v1/auth-sessions/login`: strict email/password/deviceName plus optional `transport` (`token` default, `browser` for portals). Browser response contains access data and refresh expiry, with no raw refresh JSON.
- `POST /api/v1/auth-sessions/refresh`: browser sends `{ "transport": "browser" }` with cookie/header/origin; native sends `{ "refreshToken": "..." }`. No automatic retries after an uncertain response. A lost response or genuinely simultaneous stale refresh can force reauthentication.
- `POST /api/v1/auth-sessions/logout`: bearer required; browser also sends its guard/origin and `{ "transport": "browser" }`. Revokes the session and clears the browser cookie. Expired/revoked browser logout also clears the cookie with 401.
- `GET /api/v1/users/me`: safe admin/partner DTO including `passwordChangeRequired` and current `companyId`, with no password/hash/session secrets.
- `POST /api/v1/users/me/password`: current/new password; 204 atomically changes the credential, clears the restriction, revokes all sessions and clears the browser cookie. Requires fresh sign-in; see [full lifecycle and retry policy](partners.md#restricted-sign-in-and-change).
- `GET /api/v1/auth-sessions`: own active sessions, deterministic time/ID pagination, consistent whole-range totals. Cursor anchors are scoped to the user.
- `DELETE /api/v1/auth-sessions/:sessionId`: revoke an owned session; other users' IDs return 404.

The admin portal restores once at startup and renews browser access 30 seconds before expiry. Access tokens stay only in Zustand memory; raw refresh credentials never enter JS state, local/session storage or query/mutation caches. No automatic mutation replay is added. Session revisions reject abandoned refresh/login results; successful refresh cancels and removes old private queries before installing the new access credential.

Web Locks serialize cookie operations across same-origin tabs where supported. BroadcastChannel clears other tabs' sessions/private queries after sign-in/account change or logout; sender IDs prevent a tab from clearing itself. On unsupported browsers, local single-flight still prevents duplicate same-tab refresh; a cross-tab rotation race can safely force reauthentication. The live suites test desktop/mobile Chromium, not every browser or physical device.

## Abuse controls and maintenance

DEC-30: Redis remains unused. Auth limiter state is durable in `auth_rate_limits`; keyed HMACs avoid raw email/IP storage. Atomic fixed windows apply before password verification or refresh processing:

| Limit | Default | Configuration |
| --- | --- | --- |
| Login per IP | 60 / 15 minutes | `AUTH_LOGIN_IP_LIMIT` |
| Login per normalized account | 10 / 15 minutes | `AUTH_LOGIN_ACCOUNT_LIMIT` |
| Refresh per IP | 120 / minute | `AUTH_REFRESH_IP_LIMIT` |
| Password change per account | 5 / 15 minutes | Fixed implementation bound |
| Password change per IP | 30 / 15 minutes | Fixed implementation bound |

Blocked requests return 429 with consistent `Retry-After` and JSON seconds. Database failure denies authentication; no memory fallback bypasses counters/revocation. Proxy forwarding is not trusted by default; behind a gateway, calibrate trusted proxy/IP handling and these thresholds with synthetic load/NAT tests before pilot. Authenticated business-route limiting remains separate work.

Operations must prune expired limiter buckets in bounded batches and remove expired sessions/consumed hashes only after absolute expiry. For example, reviewed maintenance SQL can delete at most 1,000 expired limiter keys per transaction using a selecting subquery; do not flush active limiter state or delete consumed-token history from active sessions. Scheduling/retention and backup policy remain operational release tasks; no background cleanup job is claimed here.

## Setup and tests

1. Generate a unique key using the command in `.env.example`; configure it in ignored `.env.dev`/deployment secrets.
2. Apply committed migrations with `pnpm run db:deploy` and generate/build with the existing backend scripts.
3. Supply `ADMIN_BOOTSTRAP_PASSWORD` through your local secret environment, then run `pnpm run admin:create --email <email> --name <full-name>`. Do not put passwords in CLI arguments or commit them. Unset the environment password afterward. Repeated creation refuses the existing account.
4. Start the API and admin portal with matching origins/hostnames. Authentication works; unimplemented Orders/Trips/Statements endpoints remain visibly unavailable rather than returning fake empty data.

Backend tests use real PostgreSQL for rotation/reuse/races, revocation, expiry, cookie attributes, CSRF, account isolation and limiter persistence. `admin-portal` has `test:e2e:live`: set `DATABASE_URL` and `TEST_DATABASE_URL` to the **same disposable migrated database**. It starts the real API and portal, creates synthetic admins through the real bootstrap CLI and exercises login, private cookies, reload persistence, second-tab access and cross-tab logout with no intercepted API responses. Those synthetic fixture accounts are confined to the disposable database. Mock business regressions remain a separate suite.

Dependencies verified on 17 October: argon2 0.45.1, jose 6.2.12 and cookie 2.0.1, exact engine-compatible official npm versions. Argon2's required native install hook is explicitly approved in the backend pnpm configuration. Supported APIs were checked against [node-argon2](https://github.com/ranisalt/node-argon2), [jose](https://github.com/panva/jose) and [cookie](https://github.com/jshttp/cookie). Hash settings meet the cited [OWASP Argon2id minimum](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html); the browser guard follows [OWASP custom-header/origin guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). Security, deployment and workload validation still require independent evidence.
