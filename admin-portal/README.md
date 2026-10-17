# HireD admin portal

Admin authentication now integrates with the real backend: HttpOnly refresh-cookie persistence across reloads, access tokens held only in memory, guarded refresh/logout, pre-expiry renewal and cross-tab session cleanup. Follow [backend authentication setup](../backend/authentication.md) for the key, migrations, admin bootstrap, matching same-site hostnames and exact allowed origins. Company list/create/detail and payout display now use the real [company/rate backend](../backend/companies.md). Partner provisioning, Orders, Drivers and financial APIs remain pending; their existing regression tests use intercepted responses.

`pnpm run test:e2e:live` exercises real desktop/mobile authentication and company creation/profile/rate display. Set `DATABASE_URL` and `TEST_DATABASE_URL` to the same disposable migrated database; the suite starts both API and portal and creates synthetic admin fixtures. It needs backend dependencies/client generation first. The normal `test:e2e` suite continues to test mocked business flows separately.

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

Use feature-based modules. Authentication, Operations Overview, Orders, Companies and Drivers (directory/application details, private documents, initial activation and availability calendar) are implemented frontend features. Trips currently provides a read-only acceptance handoff; add the remaining trip workflows as they are built.

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
│   ├── overview/               # Summary API validation, queries and responsive overview page
│   ├── companies/              # Directory, company/split creation, profile and scoped partner provisioning
│   ├── drivers/                # Directory, application details, documents, activation and availability calendar
│   ├── orders/                 # List, intake, details, decisions, company choices and validation
│   └── trips/                  # Read-only trip summary for the accepted-order handoff
├── shared/
│   ├── api/api-client.ts
│   ├── assets/hired-logo.svg
│   ├── components/RequestFeedback.tsx
│   ├── hooks/use-retry-delay.ts
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
| Order search, filters, cursor history and return links | URL search parameters | Orders feature; local draft form fields remain in React state |

- `QueryProvider` creates one stable TanStack Query client for API data. Queries default to 30 seconds of freshness with automatic retries disabled; individual features can choose explicit freshness and retry policies. Use query keys scoped by the current user/company and filters, and invalidate affected queries after confirmed writes.
- `useAuthStore` uses Zustand for the shared in-memory admin session and expiry status. Components subscribe with selectors. `useAuth` coordinates React Query login/logout mutations; pending state is shared across consumers through `useIsMutating`. `AuthSessionMonitor` handles expiry once at the application root.
- Authentication mutations do not retry or pause for later offline replay. They reset after success or failure, with immediate garbage collection, so settled credentials and results are not retained in the mutation cache. Access tokens live only in the Zustand session store, which has no persistence or devtools middleware.
- Login, successful logout, session expiry and authenticated `ApiError` 401 responses cancel outstanding queries and remove cached data. No query cache or session persistence is configured. A failed logout preserves the session for an explicit retry.
- Form fields, password visibility, validation and retry countdown remain local React state. Orders keeps applied filters/pagination in URL search parameters; use that pattern for later lists. Future UI state shared across unrelated screens can use focused Zustand stores; API records remain in React Query.

## Authentication integration

- Sends email, password and `deviceName` to `POST /api/v1/auth-sessions/login` using the draft OpenAPI contract.
- Local development proxies `/api` to `http://localhost:3000`. For a separate API origin, copy `.env.example` to `.env.dev` and start with `pnpm run dev --mode dev`; production can set `VITE_API_BASE_URL` at build time. A separate origin requires backend CORS configuration, including exposure of `Retry-After` and `ETag` and allowance for `Authorization`, `Content-Type`, `Idempotency-Key` and `If-Match` headers.
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

The API layer validates consumed fields, expected status and first-page metadata, and retains only minimal summary fields. No financial calculations, contacts or private documents are cached by the overview. Company labels currently use authoritative IDs because list DTOs do not include display names. Create Order and individual order/trip links now work. Individual statement links, filtered section destinations and overview company-name enrichment await their corresponding modules.

The layout follows the saved overview's metrics, incoming orders, attention treatments and active-trip snapshot, with compact previews in separate panels. It adapts from four metric columns to two, then one at 320px; narrow layouts place attention first. Synthetic tests cover the API composition and screen states; **real-backend integration is still pending**.

## Orders

The [`orders` feature](src/features/orders/) implements `/orders`, `/orders/new` and `/orders/:orderId` using existing draft API operations. `/trips/:tripId` is a minimal read-only trip summary for the acceptance handoff; trip assignment remains future work.

- The inbox uses cursor pagination with a 25-record page and whole-range `pageInfo.totalCount`. Company, status and inclusive creation-date controls use documented server filters. The end day becomes the following midnight in Asia/Kolkata for the API's exclusive upper bound.
- **Search current page** and **Source · current page** only filter loaded rows, as selected by the user because the API has no server search/source parameters. Search covers ID, loaded company name (or ID) and route. The displayed loaded/shown counts remain separate from the server total. These controls preserve the current cursor; changing a server filter resets it.
- Applied filters, cursor history and safe return links live in the URL. Company choices load in explicit pages; unknown company names fall back to IDs. Creation confirms the selected company's active status, sends an `admin_*` source and converts native local date/time input to an explicit `+05:30` instant. Contact and notes stay in local form state until submission. The saved response precedes Received feedback; the detail is then read for its ETag.
- Accept/reject dialogs are distinct native modal dialogs with keyboard focus, validation and disabled pending controls. Acceptance normalizes INR strings without floating-point arithmetic, allows the documented zero amount and validates the returned order/trip relationship, amount and Unassigned status. Rejection requires a trimmed reason. Neither action claims that email has been delivered.
- Decisions require a strong ETag from the latest order read and send `If-Match`; creation and decisions send `Idempotency-Key`. A missing/weak ETag disables decisions. A definitive 409/412/428 requires explicit refresh, review and a new confirmation. Inputs survive validation and concurrent-decision errors.
- Network interruption, 5xx, malformed success or `COMMAND_IN_PROGRESS` can leave a save outcome unknown. The form/dialog locks the original intent and offers an explicit retry with the same key/body/version. Keep that page open to confirm the result; leaving/reloading loses this in-memory retry identity. No success or rollback is inferred from interruption. This safeguard depends on backend durable idempotency and replay lookup before stale-version checks.
- Commands never retry automatically or queue for later offline execution. Server retry guidance controls explicit retry countdowns. Settled mutation records are reset; late results after unmount/logout cannot navigate or repopulate a new session. Confirmed writes invalidate scoped order-list and overview queries. Detail, company and trip queries use the shared authenticated client and global 401 handling; a resource-specific 403 preserves the session.

The backend remains a skeleton. Real creation, decision concurrency, replay, authorization, CORS and total-count behavior require integration verification. Server-wide search/source filtering remains open in the [checklist](todo.md#3-orders--first-complete-business-workflow). No API contract extension or assignment controls are claimed by the Orders increment.

## Companies

The [`companies` feature](src/features/companies/) implements `/companies`, `/companies/new` and `/companies/:companyId` with the existing draft company and payout-rate APIs.

- The directory requests `GET /api/v1/companies?limit=25` with an optional opaque cursor, ordered newest first. **Search current page** and **Status · current page** filter loaded records only because the draft API declares no server search/status parameters. URL parameters retain filters, cursor history and safe return navigation; server `pageInfo.totalCount` remains separate from loaded/shown counts. Rows show names, contact information and active/inactive status. Partner counts and payout splits are not included in the company list DTO and are not invented for directory rows.
- Creation collects both legal/display names, contact name/email/phone and billing address. Persistent labels, native email validity, field errors and first-invalid-field focus support correction. The initial driver/company percentages must each be positive and total exactly 100.00%, following the API's stricter `PositivePercent` contract. Integer hundredths normalize to exact decimal strings; a fixed ₹10,000 preview uses exact integer arithmetic and shows expenses separately.
- `POST /api/v1/companies` saves the company and initial split together using the required `Idempotency-Key`, without an undeclared `If-Match`. Inputs survive definitive validation failures. Pending saves block duplicates. Interrupted/5xx/malformed-success responses lock the original body/key for explicit replay; throttling during replay keeps that intent locked. No automatic retries or offline queuing occur. Leaving/reloading loses the in-memory retry identity; server durable idempotency remains required.
- A validated saved response precedes success feedback and detail navigation. Confirmed creation invalidates scoped company lists and order company choices. Queries and mutation caches remain scoped to the admin session; settled mutations reset, and late responses after logout/unmount cannot populate a new session or navigate.
- Detail shows authoritative company contact/status/timestamps in IST, reads payout rates independently and links to company-filtered Orders. An open-ended rate identifies the current split under the draft server-time/no-future-scheduling contract. Historical closed intervals are not presented as current; older history pages can be checked explicitly if no current rate is loaded. Rate failures retain the profile, and retained data is marked stale after refresh errors. Protected reads use shared 401 session cleanup; resource-specific 403 responses preserve the session.
- Loading, empty, unavailable, malformed-response, retry-delay and stale states are covered. Desktop tables become mobile record cards; list, creation and detail overflow checks cover 1440/768/390/320px.

Company profiles also include **Partner accounts** with a paginated list and a native **Create partner account** dialog:

- `GET /api/v1/companies/:companyId/partners` reads 25 accounts per page. Query keys include the verified admin and company; URL cursor history preserves company return navigation. Full account totals, active/inactive state and primary-contact flags come from the server. Loading, initial/refresh failures, retained stale rows and empty states are independent of profile/rate requests.
- `POST` on the same company-scoped route creates the user and membership together. The form collects full name, email, optional phone, an opaque initial password and primary-contact flag. Role and membership are not client-selectable. Runtime validation rejects wrong-company memberships, nonpartner roles, driver associations and malformed responses. Returned data keeps only the allowed display fields, discarding echoed credentials/tokens.
- The command uses `Idempotency-Key` and no undeclared `If-Match`. Pending requests block duplicates; interrupted/5xx/malformed responses and `COMMAND_IN_PROGRESS` retain the exact company/body/key for explicit replay. Throttling honors server retry guidance, including while the original intent remains locked. A definitive account conflict requires an explicit list refresh and review before resubmission; definitive validation failures allow corrections with a new command identity.
- Initial passwords live only in the dialog state and private retry ref, outside React Query mutation variables/results and persisted stores. Cancel/success, company navigation and session loss discard them; unmount aborts the outstanding transport without claiming that the server rolled it back. Settled mutations reset, late results cannot update a different session/company, and confirmed creation invalidates only that company's account lists. Leaving/reloading an uncertain command loses its in-memory retry identity.
- The accessible dialog masks passwords by default, supports visibility control, field-specific errors and first-invalid-field focus, keeps background controls inert and restores trigger focus after close. Issued credentials must be shared securely; no email delivery, invitation or mandatory initial-password-change behavior is claimed. Password policy and change transport remain unresolved under DEC-03.

Company editing/deactivation and payout-rate management remain separate increments. Overview company-name enrichment also remains open. Atomic company/initial-rate creation, admin authorization, signed cursor totals, durable replay and real company API integration now pass live tests. Partner-user/membership provisioning and own-company scope remain pending; their frontend regressions are still intercepted.

## Drivers

The [`drivers` feature](src/features/drivers/) implements `/drivers` and `/drivers/:driverId` against the existing draft read APIs.

- The directory defaults to Active and offers Pending, Inactive and Suspended views. `GET /api/v1/drivers` receives `limit=25`, the operational status, optional `isOnline` and an opaque cursor. Results retain the API's newest-first ordering. Search is explicitly current-page only; the API has no directory-wide search parameter. Full server-filtered totals remain separate from shown/loaded counts. Status/online changes reset pagination; search preserves it. URL state and safe return links retain filters/cursor history after profile review.
- The responsive directory displays contact information, enabled/disabled user accounts, online/offline state and selected-day calendar availability separately from operational status. Online state does not establish calendar availability or connectivity, and pending drivers remain ineligible for assignment. Assignment controls remain pending.
- Application/profile detail shows authoritative name, email, optional phone/date of birth/address, operational and account status, online state, application/update timestamps and first activation history. Missing optional information is labeled explicitly. Timestamps use IST; a birth date stays a calendar date. Activation completeness still depends on DEC-09.
- API validation rejects malformed records, unrelated detail identities, non-driver or wrong-profile associations, rows outside server filters, duplicate driver IDs and invalid/repeated pagination cursors. Only allowed display fields enter React Query caches. Query keys include the admin session identity and filters/resource ID; authenticated reads use cancellation, shared 401 cache/session cleanup and resource-specific 403 recovery. Invalid route IDs do not trigger a driver request.
- Loading, empty, unavailable, throttled and stale refresh states have explicit feedback. Saved records remain visibly stale after failed refreshes, and retry buttons honor server delays. Tests use synthetic intercepted responses, including desktop/mobile layouts down to 320px. No running backend integration has been verified.

### Private driver documents

Application details now show **Driving Licence, Aadhaar, PAN and PCC** under Current uploads. API compatibility spelling remains `aadhar`. The document list requests `GET /api/v1/drivers/:driverId/documents?limit=25&isCurrent=true`, completes opaque-cursor pagination and validates at most one current record per type before showing missing uploads. A failed or incomplete load is not presented as proof that a document is missing. Upload times use IST and expiration dates remain calendar dates. Metadata errors retain the driver profile; stale upload records disable opening until refreshed.

View privately opens a native modal with loading/error/retry feedback. On explicit open/retry, the client reads authorized file metadata, requires a clean scan and supported PDF/JPEG/PNG type, then sends the documented bodyless `POST /api/v1/file-assets/:assetId/download-links`. It sends no undeclared idempotency/version headers. Pending/rejected scans, unavailable files, malformed metadata, unsupported types and retry delays have distinct feedback. Backend checks must still enforce current attachment authorization and scan status at issuance; the frontend checks do not establish those guarantees.

Signed URLs and bytes stay outside ordinary React Query queries and mutation variables/results. The file fetch omits cookies and bearer headers, disables caching and referrers, and rejects redirects. Response MIME/signature and declared size are checked while buffering at most **10 MiB**. This is a browser preview budget, not a selected backend upload policy. The dialog renders an in-memory object URL as an image or native PDF frame. Closing, navigation, session loss or link expiry removes the preview and revokes its object URL; pending requests abort and late results cannot populate a later session. Retrying checks metadata and requests a new link. Already saved/downloaded copies cannot be recalled by closing the preview.

Integration requires **direct HTTPS signed URLs** and storage CORS allowing the portal origin to read the file without credentials, along with correct MIME/size and server-side private-file authorization, scanning, audit and no-store responses. API origins alone do not configure storage CORS. Native PDF rendering depends on browser support; automated browser coverage currently targets Chromium desktop/mobile emulation. No actual storage service or running backend has been verified. No upload, replacement or formal document verification action is added by document viewing.

### Driver activation

Pending application details include an Activation check and confirmation dialog. This frontend follows the **proposed DEC-09 rule** in the draft API: an enabled account plus current Driving Licence, Aadhaar, PAN and PCC uploads with clean scans. The policy is not newly approved by implementing it. Inactive/suspended reactivation, suspension and account administration are separate work; this increment exposes initial pending-driver activation only.

The readiness query reads the authoritative driver, completes current-document pagination and reads authorized scan metadata. Missing uploads, pending/rejected scans, disabled accounts, changed operational status, inaccessible metadata and stale/failed checks block opening the confirmation. Readiness checks never request signed links or file bytes. Document expiry and additional profile-completeness rules are not invented as activation criteria.

The modal requires an audit reason of 1–500 characters, normalizes surrounding whitespace, preserves input after recoverable failure and explains that activation grants operational access rather than formal document verification. A new command rechecks driver/documents/scans before sending `PATCH /api/v1/drivers/:driverId/status` with `{ status: 'active', reason }` and the required `Idempotency-Key`. No undeclared `If-Match` is sent. Backend authorization and atomic account/document checks must still enforce the rule if state changes after the client preflight.

Pending commands block duplicate submissions. If a dispatched PATCH is interrupted, returns a server failure/malformed success or reports `COMMAND_IN_PROGRESS`, the original reason/body/key remain locked for explicit replay. Replays skip fresh eligibility checks because the first command may already have activated the driver; server durable replay must resolve that intent before applying current preconditions. Throttling honors server retry guidance and preserves an already uncertain intent. A failed preflight does not claim an unknown write. Definitive rejection/conflict requires a fresh readiness check and review before another command identity is issued. No automatic retry or offline queuing occurs. Leaving/reloading discards the in-memory retry identity and does not establish server rollback.

Only a validated, server-confirmed active response updates the profile, shows saved feedback and invalidates the admin's driver lists/readiness data. Returned first-activation actor/time must exist and preserve previously recorded history. Activation sends no online/calendar fields. Abort and session guards discard late results, including abandoned 401 responses from an earlier session. API 401 clears private caches/session; a resource-specific 403 remains recoverable. Settled mutations reset. Final DEC-09 approval, server policy/idempotency enforcement and real-backend activation remain pending.

### Driver availability calendar

The directory's **Calendar date · IST** defaults to today's date in Asia/Kolkata and is shareable as `date=YYYY-MM-DD`. Each visible driver independently loads a one-day snapshot showing Available, Unavailable or Not provided, with an optional note and scoped refresh/retry feedback. Changing the date preserves search and cursor position; it does not filter the driver list or send an undocumented driver-list parameter. Profile links carry that date into the month view and preserve the directory return URL.

Driver detail includes a read-only calendar with `month=YYYY-MM` and `day=YYYY-MM-DD` URL state, month navigation, status counts and selected-day notes/update time in IST. Desktop uses a seven-column month grid; narrow screens use chronological two-column day cards with large touch targets. Invalid dates/ranges show explicit feedback without issuing invalid calendar requests. Pending, inactive, suspended or disabled accounts remain visibly ineligible for assignment even when a date is marked available.

Calendar reads use the documented admin `GET /api/v1/drivers/:driverId/availability-dates` with `limit=25`, inclusive `fromDate` and exclusive `toDate`. All cursor pages must succeed before records or missing-date counts are presented. Validation rejects duplicate, unordered, out-of-range or malformed dates, inconsistent totals and cursor loops. A missing record means **Not provided**, not unavailable. Queries are scoped by admin, driver and range, support cancellation, and use the existing 30-second freshness window with explicit refresh rather than focus/reconnect refetching. Independent errors preserve the directory/profile; failed refreshes retain clearly labeled stale data. Retries respect server delays; 401 clears session/caches and resource-specific 403 remains recoverable.

Admin views do not invoke driver-only availability writes. Availability, online state and activation are separate; an available day neither reserves a driver nor proves no overlapping trips. The draft DTO supplies no booked intervals or assignment conflicts. Directory snapshots are independent requests, not an atomic fleet calendar or directory-wide availability filter. Backend authorization must enforce the requested driver scope; the date DTO itself has no driver identity. Real calendar data, authorization and backend integration remain unverified.

## Routing and admin layout

[React Router](https://reactrouter.com/start/declarative/installation) uses its supported declarative APIs through the pinned `react-router` package. `BrowserRouter` lives in `main.tsx`; [App](src/app/App.tsx) owns the public login route and nested protected routes.

- [RequireAdmin](src/features/auth/components/RequireAdmin.tsx) requires an unexpired, active admin session and server-confirmed current-admin identity. Initial verification shows a loading screen; recoverable failures offer retry and sign out. A rejected/disabled/non-admin identity ends the local session. Other protected API calls using the shared client end the session on 401; a resource-specific 403 preserves the session.
- [AdminLayout](src/app/layout/AdminLayout.tsx) supplies the desktop sidebar, top bar, current-admin identity, sign out, active links, page titles, skip link and content focus after navigation. Below 900px, a native modal navigation drawer supports keyboard access, Escape/backdrop/close actions, route-change closing and resize cleanup.
- Protected routes include `/overview`, `/orders`, `/orders/new`, `/orders/:orderId`, `/trips/:tripId`, `/companies`, `/companies/new`, `/companies/:companyId`, `/drivers`, `/drivers/:driverId` and the remaining navigation sections. Unknown authenticated routes show a protected 404 with a return link. Nested order/trip/company/driver routes preserve their section title and active navigation. Remaining section pages are landing placeholders. The next frontend task is [trip list, filtering and lifecycle detail](todo.md#5-trips-and-assignment).
- The existing Nginx `try_files` fallback serves the SPA for direct routes. Production hosting must preserve that fallback. Browser reload intentionally requires signing in again because session tokens stay in memory; backend authorization remains required for every API operation.

## Design and accessibility

The login split layout becomes stacked on narrow screens, with 48px mobile controls, persistent labels, password visibility, keyboard submission, focus indicators, field-specific validation and announced request feedback. Synthetic example credentials in the reference are placeholders rather than prefilled credentials.

## Verification

The saved test suites passed on 17 October 2026: **385 Vitest tests** and **122 desktop/mobile Playwright checks**, using synthetic intercepted API/storage responses. Build, lint and test typechecking passed. See the [verification record](testing.md#verification-record) for commands and environment. The GitHub Actions workflow is configured; its first remote run and real-backend integration remain pending.
