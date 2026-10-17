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

Vitest/React Testing Library and Playwright provide saved authentication, overview, Orders, Companies, Drivers, private-document and activation regression tests. The current suites pass 335 Vitest tests and 108 desktop/mobile browser checks, including protected routing. See [testing guidance](testing.md) for commands, version evidence and remaining limitations. Extend coverage as each feature is implemented.

- [x] Select and pin compatible, supported unit/component and browser test tooling; document the configured commands.
- [x] Add initial unit tests for authentication request/response validation, role checks, retry policies and error boundaries.
- [ ] Add financial calculation and other nontrivial transformation tests with the corresponding features; exact order-amount normalization, company payout percentages/previews, IST date ranges, cross-midnight display and invalid calendar/timestamp rejection are now covered.
- [x] Add login component tests for accessible labels, keyboard submission, invalid input, password visibility, loading/duplicate-submission guards and preserved input on failure.
- [x] Add API integration tests with synthetic mocked responses for invalid credentials, forbidden roles, malformed responses, network failures and server-directed retry delays.
- [x] Add shared-state regression tests for synchronized Zustand consumers, session expiry, cache cleanup, failed-logout recovery and discarded settled mutation credentials.
- [x] Add browser tests for login/logout, invalid credentials, retry delay, expiry, reload/session isolation and desktop/mobile layout.
- [x] Add protected navigation and direct-route access tests, current-admin validation, logout/back navigation, mobile drawer focus and session rejection coverage.
- [x] Add browser coverage for order creation, acceptance, rejection, validation, URL/cursor navigation, conflict refresh, interrupted-decision replay and throttling.
- [ ] Extend browser coverage to assignment and statement workflows as those features become available.
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
- [x] Add Create Order and individual order/trip links from the overview to implemented routes.
- [ ] Add individual statement links when statement detail exists. Current section links do not claim to apply filters.
- [ ] Enrich company labels with authoritative display names when company data is implemented; current DTOs provide company IDs only.

Frontend implementation is complete; backend verification remains pending. Overview requests all companies/all dates with `received`, `ongoing`, `unassigned` and `pending_verification` status filters. It shows three incoming orders and one preview in each other section, preserving each API's ordering. Statement counts cover all pending-verification statements, not a personalized count of actions available to the current admin. Independent queries are not one atomic snapshot; the oldest successful summary update and individual timestamps remain visible. See [README](README.md#operations-overview) for the composition and remaining limitations.

## 3. Orders — first complete business workflow

- [x] Build the orders list with current-page search/source filtering, server company/creation-date/status filters and documented cursor pagination.
- [x] Keep shareable filters and cursor history in the URL; preserve them when returning from detail. Only server-filter changes reset pagination.
- [x] Build admin order entry and details, including paginated company choices, active-company confirmation, route, IST schedule, contacts and separate vehicle/service notes.
- [x] Add acceptance with exact decimal-string amount validation (including contract-permitted zero); confirm the saved result and link to the resulting read-only Unassigned trip summary.
- [x] Add rejection with a required reason in a distinct accessible confirmation dialog.
- [x] Preserve input on recoverable errors, prevent duplicate submissions, retain the same key/body/version for ambiguous retries and require refresh/review after concurrent decisions.
- [ ] Agree and implement server-wide search/source filtering. The draft list API has no such parameters; the user selected explicitly labeled current-page controls for this increment.
- [ ] Verify create, accept and reject flows against the backend, including documented retry/concurrency behavior.

The Orders frontend uses existing draft contracts. Reads require valid record payloads; decisions require a strong order ETag. Missing/weak versions disable decisions. Commands use required `Idempotency-Key` and declared `If-Match` headers, never retry automatically or queue offline. An interrupted/5xx command locks its intent for an explicit same-request replay, without claiming success or rollback. Order/company/trip data remains in scoped React Query caches and clears with the session. See [Orders implementation](README.md#orders) for routes and integration requirements.

## 4. Companies and drivers

- [x] Build company list, creation and detail screens with contact information and required payout split; verify exact positive percentages, atomic creation, same-request retry, cursor navigation and responsive states using synthetic responses.
- [x] Add company-scoped partner-account provisioning and retry feedback for failed provisioning; verify membership isolation, credential cleanup, duplicate guards, conflict review and same-request replay using synthetic responses.
- [x] Build active/pending driver lists and application details; include inactive/suspended views, server status/online filters, current-page search, cursor/return navigation, optional profile/activation history and responsive/error states verified with synthetic responses.
- [x] Add authorized private-document viewing with missing/unavailable states; cover all four current uploads, paginated metadata, clean-scan gates, private PDF/JPEG/PNG previews, expiry/retry delays, session cleanup, cancellation and responsive modal behavior using synthetic API/storage responses.
- [x] Add initial driver activation frontend under the current draft completeness rule (enabled account plus four current clean uploads); include audit reason/confirmation, fresh preflight, safe same-command replay, conflict review, first activation history and session guards. Final DEC-09 policy approval and real-backend enforcement remain open below. Keep activation separate from availability.
- [ ] Add availability/calendar views needed for assignment.
- [ ] Verify company, partner provisioning, document access and driver activation against the backend.

Company frontend routes `/companies`, `/companies/new` and `/companies/:companyId` are implemented. The directory uses documented cursor pagination and explicitly labeled current-page search/status controls; it shows full authorized company totals separately from loaded/shown rows. Creation sends company details and an initial positive split totaling exactly 100.00% in one idempotent command. Detail reads contact data and payout rates independently, preserves profile access on rate-only failures and links to company-filtered Orders. Company profiles now include a paginated, company-scoped partner-account list and provisioning dialog. Partner creation uses one atomic draft user/membership command; definitive failures preserve editable inputs, while interrupted outcomes lock the original body/key for explicit retry. Credentials remain in local memory and are discarded on success, dialog close, company navigation or session loss. Directory-wide partner counts, company edits/deactivation, payout-rate changes/history UI and backend verification remain pending. See [Companies implementation](README.md#companies).

Driver frontend routes `/drivers` and `/drivers/:driverId` are implemented. The directory defaults to Active, with Pending/Inactive/Suspended views and documented server online filtering. URL filters and opaque cursor history survive detail navigation; server-filtered totals are separate from loaded/current-page search counts. Detail shows application/contact information, missing optional fields, operational status, account access, online status and activation history, with IST timestamps. Response validation, cancellation, session isolation, 401 cleanup, 403 recovery, retry delays, loading/empty/stale states and layouts down to 320px are covered with mocked APIs. Current uploads include all four document types and private previews, with missing/unavailable/scan/retry states. Signed links and file bytes stay outside ordinary caches; previews are removed on close/navigation/session loss/expiry. Initial activation now follows the draft account/four-clean-upload rule, requires an audit reason and fresh preflight, preserves uncertain reason/key for explicit replay, requires refreshed review after definitive rejection and updates only server-confirmed active records. Real backend/storage authorization, scanning, atomic activation and CORS remain unverified; DEC-09 is still proposed. Next frontend task: availability/calendar. See [Drivers implementation](README.md#drivers), [private-document behavior](README.md#private-driver-documents) and [activation behavior](README.md#driver-activation).

## 5. Trips and assignment

- [x] Add a read-only trip-summary route for the accepted-order handoff; the operational directory and assignment workflow below remain pending.
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
- [ ] Approve or revise DEC-09's proposed four-current-clean-upload activation gate, then verify atomic backend account/document enforcement, first activation history, audit reasons, authorization and durable same-key replay against running services.
- [ ] Configure required API origin/CORS behavior, expose `ETag` and `Retry-After`, allow declared command headers and configure the production reverse proxy.
- [ ] Verify direct HTTPS private-file links and storage CORS/no-store behavior for credential-free previews; verify server scan gates, attachment authorization, masked metadata and audit logging with a running backend/storage service.
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

The testing foundation, protected layout, Operations Overview, Orders, company list/creation/detail plus partner provisioning, and driver directory/application-detail/private-document/initial-activation frontend are complete with mocked API/storage verification (335 Vitest tests and 108 desktop/mobile browser checks). Next frontend task: Section 4, availability/calendar views needed for assignment. Final activation-policy approval (DEC-09), real-backend/storage integration, server-wide order search/source filtering, statement links and overview company-name enrichment remain open above. The trip summary is a read-only handoff, not the assignment workflow. Update this checklist as work is verified; a rendered screen alone does not complete its API integration.
