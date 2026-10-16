# Admin portal development checklist

Working checklist based on the [admin design guide](../docs/design/admin/README.md), [screen index](../docs/design/admin/screens.json), [UI/UX specification](../docs/ui-ux-specification.md), [workflows](../docs/workflows.md) and [draft API](../docs/api/openapi.yaml). Follow [AGENTS.md](AGENTS.md) and the [README](README.md).

Checked items describe implemented frontend work, not deployed functionality. The backend is currently a skeleton. Tasks below describe frontend implementation unless explicitly listed as backend/contract dependencies. Keep real integration tasks open until verified against a running backend.

## Completed foundation

- [x] Admin login UI matching the saved design, using the supplied logo and shared tokens.
- [x] Field validation, password visibility, loading, invalid-login, throttling and expired-session feedback.
- [x] Draft login/logout API client, active-admin response checks and in-memory session expiry.
- [x] React Query for API requests and Zustand for shared session state, with cache cleanup.
- [x] Feature-based source structure, naming conventions, README and agent guidance, including the no-deprecated-APIs rule.
- [x] Build/lint and browser checks using synthetic intercepted API responses.

## Testing foundation

Vitest/React Testing Library and Playwright provide saved authentication and overview regression tests. The current suites pass 84 Vitest tests and 24 desktop/mobile browser checks, including protected routing. See [testing guidance](testing.md) for commands, version evidence and remaining limitations. Extend coverage as each feature is implemented.

- [x] Select and pin compatible, supported unit/component and browser test tooling; document the configured commands.
- [x] Add initial unit tests for authentication request/response validation, role checks, retry policies and error boundaries.
- [ ] Add exact money and other nontrivial transformation tests with the corresponding features; overview date tests now cover IST across midnight and invalid period/timestamp rejection.
- [x] Add login component tests for accessible labels, keyboard submission, invalid input, password visibility, loading/duplicate-submission guards and preserved input on failure.
- [x] Add API integration tests with synthetic mocked responses for invalid credentials, forbidden roles, malformed responses, network failures and server-directed retry delays.
- [x] Add shared-state regression tests for synchronized Zustand consumers, session expiry, cache cleanup, failed-logout recovery and discarded settled mutation credentials.
- [x] Add browser tests for login/logout, invalid credentials, retry delay, expiry, reload/session isolation and desktop/mobile layout.
- [x] Add protected navigation and direct-route access tests, current-admin validation, logout/back navigation, mobile drawer focus and session rejection coverage.
- [ ] Extend browser coverage to the critical order, assignment and statement workflows as those features become available.
- [x] Isolate/reset stores, query caches, timers and fixtures between tests; use synthetic records in test artifacts.
- [x] Configure CI for frozen installation, build, lint and the automated suites, with browser failure diagnostics.
- [ ] Verify the first GitHub Actions run and configure required checks with the repository administrator.
- [ ] Add real-backend integration runs when the backend is available; report them separately from mocked API tests.

## 1. Protected navigation and admin layout — complete

- [x] Add application routing with supported APIs compatible with the pinned React version.
- [x] Separate signed-out login routes from protected admin routes; redirect unauthenticated access to login.
- [x] Route successful login to Operations Overview instead of the temporary session confirmation.
- [x] Build the desktop sidebar and top bar from the saved admin designs.
- [x] Add a keyboard-accessible mobile navigation drawer, active navigation and close behavior.
- [x] Place the admin identity and working sign-out action in the layout.
- [x] Handle expired/rejected sessions during protected requests: hide private content, clear session/cache and reauthenticate.
- [x] Handle unknown routes and direct navigation/reload without exposing protected content.

## 2. Operations Overview

- [x] Create the overview feature using the [desktop overview](../docs/design/admin/references/overview.png), shared tokens and responsive references; verify layouts down to 320px.
- [x] Show counts for orders awaiting decision, unassigned/ongoing trips and statements awaiting approval, using full filtered `pageInfo.totalCount` rather than preview row counts.
- [x] Add incoming-order, active-trip, unassigned-trip and statement previews with working links to existing sections.
- [x] Show refresh controls and individual last-updated timestamps in IST; disable refresh while requests are pending.
- [x] Implement loading, empty, partial/total failure and stale-data states; distinguish unavailable counts from zero and retain explicitly stale values after failed refreshes.
- [x] Wire the documented draft list queries through admin-scoped React Query hooks; validate consumed fields and pagination, cancellation and 401/403 behavior with synthetic responses.
- [ ] Verify overview totals, previews, scope and recovery against a running compatible backend.
- [ ] Add links to individual records and the Create Order action when the order/trip/statement routes exist. Current section links do not claim to apply filters.
- [ ] Enrich company labels with authoritative display names when company data is implemented; current DTOs provide company IDs only.

Frontend implementation is complete; backend verification remains pending. Overview requests all companies/all dates with `received`, `ongoing`, `unassigned` and `pending_verification` status filters. It shows three incoming orders and one preview in each other section, preserving each API's ordering. Statement counts cover all pending-verification statements, not a personalized count of actions available to the current admin. Independent queries are not one atomic snapshot; the oldest successful summary update and individual timestamps remain visible. See [README](README.md#operations-overview) for the composition and remaining limitations.

## 3. Orders — first complete business workflow

- [ ] Build the orders list with search, company/source/date/status filters and contract pagination.
- [ ] Keep shareable filters in the URL; preserve them when returning from a detail page.
- [ ] Build admin order entry and details, including company, route, schedule, contacts and vehicle/service notes.
- [ ] Add acceptance with a validated amount; show the saved result and link to the resulting Unassigned trip.
- [ ] Add rejection with a required reason in a distinct confirmation dialog.
- [ ] Preserve input on failure, prevent duplicate submissions and refresh after concurrent decisions.
- [ ] Verify create, accept and reject flows against the backend, including documented retry/concurrency behavior.

## 4. Companies and drivers

- [ ] Build company list, creation and detail screens with contact information and required payout split.
- [ ] Add company-scoped partner-account provisioning and retry feedback for failed provisioning.
- [ ] Build active/pending driver lists and application details.
- [ ] Add authorized private-document viewing with missing/unavailable states.
- [ ] Add driver activation under the agreed completeness policy; keep activation separate from availability.
- [ ] Add availability/calendar views needed for assignment.
- [ ] Verify company, partner provisioning, document access and driver activation against the backend.

## 5. Trips and assignment

- [ ] Build trip list, filtering and detail screens with lifecycle, driver, schedule, route and estimate information.
- [ ] Build assignment with active-driver search, availability and no-candidate feedback.
- [ ] Build pre-closure reassignment with the documented ongoing-trip warning and assignment history.
- [ ] Add authorized amount/duration edits with validation, pending and conflict states.
- [ ] Display expenses separately from commission and shares; show frozen reports for closed trips.
- [ ] Keep closed financial records read-only and refresh authoritative state after conflicts.
- [ ] Verify assignment/reassignment and trip state transitions against the backend; keep close-code reveal outside admin access.

## 6. Payroll settings

- [ ] Build current split, calculation preview, change confirmation and rate history.
- [ ] Validate the documented percentage constraints and exact total of 100%; preserve contract decimal values.
- [ ] Explain the effective timing of a rate change under the agreed policy.
- [ ] Verify rate updates and unchanged historical financial records against the backend.

## 7. Monthly statements

- [ ] Build the statement register with company/month/status filters and completed-month generation.
- [ ] Handle duplicate generation, unfinished month, no eligible trips and unsubmitted-draft regeneration rules.
- [ ] Build frozen line-item detail, submission and version-aware approval states.
- [ ] Require the creator's explicit approval plus one distinct second admin; explain unavailable actions.
- [ ] Add publication feedback separately from email-delivery feedback.
- [ ] Verify generation, submission, approvals and publication against the backend, including stale-version failures.

## 8. Reports

- [ ] Implement Billing Issues, Driver Delays, Client Order Volume/Success, Driver Payouts, Trips, Orders and Driver/Staff Work reports.
- [ ] Add the documented date/driver/company filters and Trips Live, Daily and Monthly views.
- [ ] Keep whole-range totals consistent with authorization and filters rather than the current page of rows.
- [ ] Implement loading/empty/error states and readable mobile tables or record cards.
- [ ] Add exports only for agreed formats and supported API operations.
- [ ] Verify report results, totals and exports against the backend using synthetic records.

## Backend and contract dependencies

These are coordination dependencies, not implemented admin-portal functionality. Track decisions in the [decision log](../docs/decision-log.md) and update the API/client contracts together.

- [ ] Provide a running compatible backend and synthetic admin accounts for real login/logout and protected-request checks.
- [x] Identify existing draft overview source queries and full-range totals: filtered orders/trips/statements lists with `PageInfo.totalCount`; no new overview endpoint is required for this frontend.
- [ ] Confirm the backend implements those overview source queries and total-count semantics; verify with synthetic integration records.
- [ ] Resolve browser refresh transport, session lifetimes and account lifecycle under DEC-03; implement agreed refresh behavior.
- [ ] Define the initial-password-change flag, endpoint and policy before implementing that screen/routing.
- [ ] Resolve feature-specific policies before dependent flows: driver activation completeness, payroll timing/rounding, statement rules, report metrics and export formats.
- [ ] Configure required API origin/CORS behavior, exposed headers and production reverse proxy.
- [ ] Verify server authorization, session revocation, rate limits, concurrency and durable idempotency; frontend controls do not establish these guarantees.

## Completion checks for each feature

- [ ] Follow the feature module boundaries and state ownership; use supported, non-deprecated APIs.
- [ ] Cover the relevant saved screen states, keyboard access, focus/labels, readable contrast and narrow layouts down to 320px.
- [ ] Run build/lint and the configured meaningful automated tests for the changed behavior; distinguish mocked responses from real API integration.
- [ ] Review changes for private-data exposure, exact financial values and stale/conflicting updates where relevant.
- [ ] Update implementation docs and record checks actually run; complete teammate review through the documented PR process.

## Release readiness

- [ ] Verify a complete order → accepted trip → assignment → driver execution/closure → report/statement flow with the backend and affected clients.
- [ ] Require passing automated regression checks in CI for the release candidate, alongside integrated manual validation.
- [ ] Verify production build, hosting/direct-route behavior, API connectivity and environment configuration.
- [ ] Complete relevant security review and integrated release validation under the project workflow.

The testing foundation, protected layout and Operations Overview frontend are complete with mocked API verification (84 Vitest tests and 24 desktop/mobile browser checks). Next: Section 3, Orders, as the first complete business workflow. Real-backend overview integration, record links and company-name enrichment remain open above. Backend/contract work can proceed alongside independent UI implementation. Update this checklist as work is verified; a rendered screen alone does not complete its API integration.
