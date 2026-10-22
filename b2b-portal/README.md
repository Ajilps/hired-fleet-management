# HireD business partner portal

Responsive React/TypeScript partner workspace, implemented locally on 18 October 2026. Uses HireD branding and shared design tokens, with company-scoped routes and real browser authentication. No production mock-data mode or public registration is included.

## Run locally

From the repository root, copy `.env.example` to `.env`, set `LOCAL_ADMIN_PASSWORD` (15–128 characters), then run:

```sh
docker compose up --build
```

Open **http://localhost:5174**. Sign in with a **partner account**, created by an admin for a company in the admin portal at http://localhost:5173. The root `.env` account is an administrator and cannot sign in here. First login requires a new password, then fresh sign-in. Existing company, account and key data persist across restarts.

For host development, start the backend and use Node 26.11.1 and pnpm 12.11.2:

```sh
cd b2b-portal
pnpm install --frozen-lockfile --ignore-scripts
pnpm run dev --host 127.0.0.1 --port 5174
```

Vite proxies `/api` to `http://localhost:3000` by default. For another API origin, copy `.env.example` to `.env.dev` and set `VITE_API_BASE_URL`; the dev script explicitly loads Vite's `dev` mode. Configure the exact portal Origin in backend `CORS_ORIGINS`. Compose supplies `VITE_API_BASE_URL` automatically, including custom published API ports. Browser test servers use their own explicit configuration. All environment files are ignored.

## Screens and integration status

| Area | Implemented frontend | Current backend |
| --- | --- | --- |
| Authentication | Partner-only sign-in, first-login password change, fresh sign-in, cookie restoration/renewal, expiry, sign-out/retry | Live and verified with real PostgreSQL/API |
| Company/account | Own-company contact/billing details, active/inactive indicator and password change | Live and verified with real PostgreSQL/API |
| Overview | Server counts, ongoing trips, requests in review, published statements, independent failures | Live, including published statement totals |
| New order | Validated route/contact/schedule in IST, optional notes/distance, review, strict partner DTO, idempotent submission/retry | Live and verified through partner UI and admin decisions |
| Orders/trips | Status/date filters, scoped cursor pages, details, driver contact, estimates, explicit transient close-code reveal | Live assignment/status/contact, expenses and protected code reveal; visible pages refresh every 15 seconds |
| Closed-trip reports | Frozen journey, exact recorded shares, expenses separately | Live |
| Monthly statements | Published-only directory, month filter, pagination, reconciled trip lines/totals | Live |

The portal calls the documented real endpoints; unavailable collections show a retryable error and unavailable metrics, never synthetic rows or zero totals. A request is shown as saved only after server confirmation. The order/trip/code/report/statement flows have contract-fixture browser tests; real desktop/mobile journeys also verify intake, admin acceptance/rejection, shared unassigned-trip reads, admin manual intake and foreign-company denial. Real desktop/mobile checks now complete assignment, native-driver execution/closure, immutable report, two-admin approval/publication and partner statement reload. Driver calls use the native API; Flutter UI/device evidence remains separate. No payment gateway, statement approval, admin pricing or driver identity-document access is exposed to partners.

## Boundaries

- Access session stays in an unpersisted Zustand store. HttpOnly refresh cookies are controlled by the API; browser auth/password actions include the CSRF guard. No credential writes to local/session storage, logs or URLs.
- Restores are serialized and stale results ignored. Query data is scoped by user/company, cancelled/cleared on identity change or sign-out. Authenticated 401s remove protected content; resource-specific errors do not impersonate successful empty responses.
- TanStack Query owns ordinary API state; local state owns forms and transient reveals. Feature API functions project/validate responses, including company ownership. The backend remains authoritative for access.
- Partner order bodies omit company, source and binding price. Schedules use explicit Asia/Kolkata conversion; end-date filters use an exclusive next-day boundary. Retries preserve the same key/body, with a new key only for changed input.
- Close-code responses bypass query/mutation caches. Reveal requires an explicit action; outstanding reads are aborted and codes hidden on unmount/background/session loss, expiry or after one minute. Nothing copies codes into storage, lists, reports or screenshots.
- Money remains decimal strings and exact integer minor units. Published statement lines reconcile to their totals; expenses remain separate from commission. No financial mutation is implemented here.
- Mobile navigation uses a native modal dialog with keyboard dismissal/focus restoration. Layouts are checked at 1440, 390 and 320 CSS pixels. Errors/loading/empty results remain distinct.

## Checks

```sh
pnpm run build
pnpm run lint
pnpm run test
pnpm exec playwright install chromium
pnpm run test:e2e
```

`pnpm run test:e2e:live` additionally requires a migrated **disposable loopback** database in matching `DATABASE_URL` and `TEST_DATABASE_URL`, plus backend dependencies/generated Prisma client. It requires admin-portal dependencies for the cross-portal journey and starts isolated API/partner/admin processes on 3002/4177/4178, provisions unique synthetic admin/company/partner records, and tests the real first-login, company, reload, logout and revocation lifecycle. It leaves its synthetic records only in that explicitly disposable database; remove the database/container after testing. Use separate browser contexts for admin and partner sessions because the API owns a shared browser refresh-cookie name.

Local verification: 41 unit/component/transport checks, 38 intercepted desktop/mobile browser checks and two real API/PostgreSQL browser journeys, plus build, lint/naming, production Docker and Compose checks. See [verification evidence](../docs/verification/business-portal/README.md). Remote CI and independent review remain pending; `.github/workflows/b2b-portal-checks.yaml` runs the normal build/unit/browser/live checks.

## Production build

```sh
docker build --build-arg API_BASE_URL=https://api.example.test -t hired-b2b-portal:local b2b-portal
```

Run that command from the repository root. The public API origin is compiled into Vite assets via `VITE_API_BASE_URL`; it is not a secret and changing it requires a rebuild. Nginx serves the SPA as a non-root user on 8080, including deep links. Deployment must use reviewed HTTPS/same-site cookie/CORS settings; the local Compose stack is development configuration.

Architecture: `src/app` composes routes and layout; `src/features` owns auth, company, overview, operations and statements/reports; `src/shared` owns transport, validation, formatting, visuals and delay feedback. New dependencies use the exact routing/query/state/test versions already selected by the admin portal; the existing pnpm/package boundary is retained.

M5/M6 integration verified 22 October 2026: 41 unit checks, 38 fixture browser checks and 6 real desktop/mobile authentication, Orders and financial journeys pass. [Evidence and scope](../docs/verification/live-financial-workflows/README.md). The overview shows real order/trip/published-statement totals. Close codes stay transient and are hidden before retained screenshots; financial live tests disable trace/failure capture.

Business-client sessions last 24 hours from sign-in (absolute, without extension on refresh). Short-lived access tokens renew automatically, including after a backgrounded tab returns. Protected routes stay hidden while expired access is restored; an interrupted renewal offers reconnect. Sign-out/revocation still take effect immediately. See the [project change list](../docs/change-list.md).
