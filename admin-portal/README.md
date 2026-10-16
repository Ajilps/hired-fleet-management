# HireD admin portal

Coding-agent guidance is in [AGENTS.md](AGENTS.md), with links to the project design, API, security and workflow documents.

Track planned frontend work and backend dependencies in the [development checklist](todo.md).

Repeatable Vitest/React Testing Library and Playwright suites are configured. See [testing guidance and commands](testing.md) and the [testing checklist](todo.md#testing-foundation) for coverage, CI and remaining integration work.

React and TypeScript frontend for the HireD admin portal. The login page follows `../docs/design/admin/references/login.png` and uses a local copy of `../docs/design/shared/tokens.css` so independent Docker builds include the design tokens. The supplied logo from `../docs/design/logo/logo.svg` is bundled as `src/shared/assets/hired-logo.svg`, with a full-canvas viewBox for scaling; its artwork and proportions are preserved. Inter uses the documented system sans-serif fallback when unavailable.

## Run locally

From this directory, use the Node version in `.node-version`, pnpm 12.5.1 (pinned in `package.json`) and the existing lockfile:

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open the URL printed by Vite. Signed-out visits to `/` and protected routes redirect to `/login`. A verified admin session opens `/overview`.

```sh
pnpm run build
pnpm run lint
pnpm run test
```

## Source structure

Use feature-based modules. Authentication and Operations Overview are implemented frontend features; add orders, trips, drivers and other modules when their functionality is built.

```text
src/
├── app/
│   ├── App.tsx
│   ├── api/create-query-client.ts
│   ├── layout/                  # Sidebar, top bar, mobile drawer and navigation
│   ├── pages/                   # Section landing pages and protected 404
│   └── providers/QueryProvider.tsx
├── features/
│   ├── auth/
│   │   ├── api/                 # Login/logout and current-admin verification
│   │   ├── components/          # Session monitor and protected-route guard
│   │   ├── errors/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── stores/
│   │   ├── types/
│   │   ├── validation/
│   │   └── index.ts
│   └── overview/               # Summary API validation, queries and responsive overview page
├── shared/
│   ├── api/api-client.ts
│   ├── assets/hired-logo.svg
│   └── styles/
├── test/                        # Synthetic fixtures, render helpers and cleanup
└── main.tsx
```

### Module boundaries and clean code

- `app/` composes feature screens and application-wide providers. `main.tsx` mounts the application and root session lifecycle component.
- Each feature owns its UI, API calls, hooks, state, types and validation. API services handle transport/response validation; hooks coordinate requests and state; Zustand stores own shared client state; pages render the interface and handle local interactions.
- Import a feature from its public `index.ts` outside that feature. Within a feature, use direct relative imports rather than importing its own entry file. Authentication exposes its page, session monitor, route guard, auth/current-admin hooks, session store and session type.
- Features may depend on `shared/`; shared code must not import features or the app layer. Put a component in `shared/components/` when it is reused across features, rather than creating speculative abstractions.
- Keep validation functions independent of React and transport. Login validation accepts the browser's email-validity result so accessible native input rules remain the source for email syntax.
- Follow the project [naming conventions](../docs/naming-conventions.md): PascalCase component files, page names ending in `Page`, kebab-case non-component files and feature directories, and descriptive hooks and handlers.
- Preserve user input on recoverable errors and keep passwords/tokens out of persisted state, logs and cached mutation results. Record checks actually run when changing a feature.

## State management

Use **Zustand for shared client state** and **TanStack Query (React Query) for server state**. Keep each value in its owning layer rather than duplicating API records in a Zustand store.

| State | Owner | Implementation |
| --- | --- | --- |
| Signed-in admin session and expiry status | Zustand, in memory | [`useAuthStore`](src/features/auth/stores/use-auth-store.ts) |
| Login/logout requests and shared pending status | React Query mutations | [`useAuth`](src/features/auth/hooks/use-auth.ts) |
| Current-admin identity and verification status | React Query | [`useCurrentAdmin`](src/features/auth/hooks/use-current-admin.ts) |
| API data cache, request defaults and authenticated 401 handling | React Query | [`createQueryClient`](src/app/api/create-query-client.ts), [`QueryProvider`](src/app/providers/QueryProvider.tsx) |
| Session-expiry timer and cache cleanup | Root lifecycle component | [`AuthSessionMonitor`](src/features/auth/components/AuthSessionMonitor.tsx) |
| Form fields, validation, password visibility and retry countdown | Local React state | [`AdminLoginPage`](src/features/auth/pages/AdminLoginPage.tsx) |
| Future shareable search, filters and pagination | URL search parameters | Add with the relevant list/report screen |

- `QueryProvider` creates one stable TanStack Query client for API data. Queries default to 30 seconds of freshness with automatic retries disabled; individual features can choose explicit freshness and retry policies. Use query keys scoped by the current user/company and filters, and invalidate affected queries after confirmed writes.
- `useAuthStore` uses Zustand for the shared in-memory admin session and expiry status. Components subscribe with selectors. `useAuth` coordinates React Query login/logout mutations; pending state is shared across consumers through `useIsMutating`. `AuthSessionMonitor` handles expiry once at the application root.
- Authentication mutations do not retry or pause for later offline replay. They reset after success or failure, with immediate garbage collection, so settled credentials and results are not retained in the mutation cache. Access tokens live only in the Zustand session store, which has no persistence or devtools middleware.
- Login, successful logout, session expiry and authenticated `ApiError` 401 responses cancel outstanding queries and remove cached data. No query cache or session persistence is configured. A failed logout preserves the session for an explicit retry.
- Form fields, password visibility, validation and retry countdown remain local React state. Future shareable filters/pagination belong in URL search parameters. Future UI state shared across unrelated screens can use focused Zustand stores; API records remain in React Query.

## Authentication integration

- Sends email, password and `deviceName` to `POST /api/v1/auth-sessions/login` using the draft OpenAPI contract.
- Local development proxies `/api` to `http://localhost:3000`. For a separate API origin, copy `.env.example` to `.env.dev` and start with `pnpm run dev --mode dev`; production can set `VITE_API_BASE_URL` at build time. A separate origin requires backend CORS configuration, including exposure of `Retry-After` to the browser.
- Production requires a same-origin `/api` reverse proxy or an explicit API origin. The static Nginx configuration does not proxy the backend.
- The backend is currently a skeleton. There are no built-in demo credentials or simulated successful logins. A running compatible backend is required for actual authentication.
- Shows field validation, invalid credentials, loading, connection/server failures, throttling and expired-session feedback. Rate-limit delays come from `Retry-After` (seconds or HTTP date), with `error.retryAfterSeconds` as fallback. The backend must enforce limits; the countdown is feedback only.
- Only an active admin response enters the signed-in state. Non-admin sessions are rejected and a best-effort logout is requested. API endpoints must independently enforce authorization.
- Access tokens stay in React memory and are cleared at expiry; refresh tokens are discarded. Reloading requires signing in again. Browser refresh transport remains unresolved in the security docs, so no cookies or persistent token storage are introduced.
- A successful login redirects to `/overview`; the protected guard verifies the account through `GET /api/v1/users/me` before displaying the admin shell. Failed sign out remains retryable.
- `?reason=session-expired` displays the reauthentication notice. Initial password change is a separate screen; the draft login response does not define a password-change-required flag, so that routing is deferred until the contract is agreed.

## Operations Overview

`/overview` renders the feature in [`src/features/overview`](src/features/overview/), replacing its landing placeholder. Four independent, admin-scoped React Query requests compose the dashboard from existing draft OpenAPI list contracts:

| Summary | Source | Preview |
| --- | --- | --- |
| Orders awaiting decision | `GET /api/v1/orders?status=received&limit=3` | Three most recently created orders |
| Ongoing trips | `GET /api/v1/trips?status=ongoing&limit=1` | One trip in documented scheduled-pickup ordering |
| Unassigned trips | `GET /api/v1/trips?status=unassigned&limit=1` | One trip in documented scheduled-pickup ordering |
| Statements awaiting approval | `GET /api/v1/statements?status=pending_verification&limit=1` | One statement in documented period ordering |

Counts use `pageInfo.totalCount` for all authorized filtered records, including records beyond the preview page. The page explicitly shows **All companies · All dates**; it applies no undocumented daily or personal-approval filter. Each statement requires its creator's explicit approval plus a distinct second admin's approval. Independent summaries can update at different times; individual timestamps and the oldest successful update remain visible in Asia/Kolkata.

Queries use `['overview', adminEmail, 'all-companies', section]` keys, the shared authenticated client and its cancellation/session handling. They do not automatically retry or refetch on focus/reconnection. Refresh requests all four summaries, disables duplicate refreshes and preserves successful sections on partial failure. Initial failures show **Unavailable**, never a false zero. Retained values are marked **Stale** after a failed refresh or the 60-second freshness window. An overall empty state requires four successful zero totals. Authenticated 401 responses clear the session/cache; a resource-specific 403 leaves the admin session active.

The API layer validates consumed fields, expected status and first-page metadata, and retains only minimal summary fields. No financial calculations, contacts or private documents are cached by the overview. Company labels currently use authoritative IDs because list DTOs do not include display names. Section links work; individual-record links, filtered destinations, the Create Order action and company-name enrichment await their corresponding modules.

The layout follows the saved overview's metrics, incoming orders, attention treatments and active-trip snapshot, with compact previews in separate panels. It adapts from four metric columns to two, then one at 320px; narrow layouts place attention first. Synthetic tests cover the API composition and screen states; **real-backend integration is still pending**.

## Routing and admin layout

[React Router](https://reactrouter.com/start/declarative/installation) uses its supported declarative APIs through the pinned `react-router` package. `BrowserRouter` lives in `main.tsx`; [App](src/app/App.tsx) owns the public login route and nested protected routes.

- [RequireAdmin](src/features/auth/components/RequireAdmin.tsx) requires an unexpired, active admin session and server-confirmed current-admin identity. Initial verification shows a loading screen; recoverable failures offer retry and sign out. A rejected/disabled/non-admin identity ends the local session. Other protected API calls using the shared client end the session on 401; a resource-specific 403 preserves the session.
- [AdminLayout](src/app/layout/AdminLayout.tsx) supplies the desktop sidebar, top bar, current-admin identity, sign out, active links, page titles, skip link and content focus after navigation. Below 900px, a native modal navigation drawer supports keyboard access, Escape/backdrop/close actions, route-change closing and resize cleanup.
- Protected routes are `/overview`, `/orders`, `/trips`, `/drivers`, `/companies`, `/payroll-settings`, `/statements` and `/reports`. Unknown authenticated routes show a protected 404 with a return link. Operations Overview is implemented; other section pages are clear landing placeholders. The next business workflow is [Orders](todo.md#3-orders--first-complete-business-workflow).
- The existing Nginx `try_files` fallback serves the SPA for direct routes. Production hosting must preserve that fallback. Browser reload intentionally requires signing in again because session tokens stay in memory; backend authorization remains required for every API operation.

## Design and accessibility

The login split layout becomes stacked on narrow screens, with 48px mobile controls, persistent labels, password visibility, keyboard submission, focus indicators, field-specific validation and announced request feedback. Synthetic example credentials in the reference are placeholders rather than prefilled credentials.

## Verification

The saved test suites passed on 16 October 2026: **84 Vitest tests** and **24 desktop/mobile Playwright checks**, using synthetic intercepted API responses. Build, lint and test typechecking passed. See the [verification record](testing.md#verification-record) for commands and environment. The GitHub Actions workflow is configured; its first remote run and real-backend authentication/overview integration remain pending.
