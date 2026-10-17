# Admin portal testing

## Live authentication — 17 October 2026

`pnpm run test:e2e:live` uses `playwright.live.config.ts` and `e2e-live/` to start the real backend and portal against the same explicit disposable `DATABASE_URL`/`TEST_DATABASE_URL`. The backend must be installed/generated/migrated first. No API routes are intercepted. Synthetic admin fixtures are created through the operational CLI. Desktop/mobile tests cover bad credentials, successful sign-in, no raw refresh JSON/browser storage, HttpOnly cookie properties/rotation, reload persistence, a second tab, cross-tab logout and no restoration after logout.

The browser session now uses credentialed auth requests with the custom CSRF guard; other authenticated APIs retain bearer-only transport. Unit tests include restore failure/late-result isolation and pre-expiry renewal. Node's BroadcastChannel is disabled in jsdom because it spans test workers rather than browser origins; live browser tests verify real cross-tab behavior. Mock business fixtures intentionally default refresh to 401 and do not claim persistent backend sessions.

The saved test suites protect authentication, protected routing, the responsive admin layout, Operations Overview, Orders and Companies. They use synthetic fixtures and intercepted responses, so they do not establish that the backend implements authentication, authorization, summary queries, order commands or company/partner creation.

## Run checks

Use the Node version in `.node-version` and the pnpm version in `package.json`:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run test
pnpm run build
pnpm run lint
```

`pnpm run test:watch` starts interactive Vitest watch mode. `--ignore-scripts` was verified for the current dependencies; review install-hook requirements when adding packages rather than treating it as a permanent policy for every dependency.

For browser checks, install the browser matching the pinned Playwright version:

```sh
pnpm exec playwright install chromium
pnpm run test:e2e
```

If Google Chrome is already installed, it can be used locally without downloading Chromium:

```sh
PLAYWRIGHT_CHANNEL=chrome pnpm run test:e2e
```

Playwright starts Vite on `http://127.0.0.1:4174`, independently of the normal development preview. It reuses an existing server at that address outside CI; ensure any existing server belongs to this checkout. The desktop and mobile projects run the same behavior checks at different viewport/touch settings. Tests also check 768px, 390px and 320px widths for horizontal overflow.

Each browser test has an explicit 30-second limit, and the complete suite has a ten-minute limit to accommodate both browser projects and retries with two CI workers. The previous three-minute suite limit interrupted the 122-test CI run after 94 passes; it did not indicate an assertion failure in the interrupted driver test. The GitHub Actions job retains its separate 20-minute limit for installation, build, lint and both test suites. Tests wait for observable responses/state rather than assuming the request has finished when the URL changes.

## Test ownership and isolation

- Co-locate Vitest tests with the feature module, using `<source>.test.ts(x)` for unit/component tests and `<purpose>.integration.test.tsx` for integration tests.
- `src/test/` contains synthetic auth fixtures, common cleanup and per-test query-client creation. It is test support rather than an application feature.
- `vitest.config.ts` reuses the Vite transforms, runs in jsdom, and includes only source `.test` files. Browser specs live in `e2e/` and run separately through `playwright.config.ts`.
- `tsconfig.test.json` typechecks the test source/configuration during `pnpm run build`; application compilation excludes test files and support modules. Tests are not imported by the production entry point.
- Assert observable behavior and important boundaries, including error recovery and account isolation. Avoid snapshots of implementation details or tests that merely repeat trivial functions.
- Cleanup unmounts rendered components, clears per-test query clients, restores the Zustand initial state, resets online status and storage, and restores real timers. Fetch stubs and spies reset between tests.
- Keep real API credentials and private records out of fixtures, screenshots, reports and traces. Browser traces and screenshots are retained on failures; generated outputs are ignored by Git.

## Initial coverage

| Suite | Behavior covered |
| --- | --- |
| Authentication service | Request contract, access-session-only result, generic invalid credentials, non-admin/inactive rejection, malformed/expired/HTML responses, connection failure, retry headers/body and logout outcomes |
| Login component | Accessible field feedback/focus, keyboard submit, password visibility, retained input after failure, no automatic retries, disabled duplicate submissions and login/logout cleanup |
| Current-admin API | Malformed identity, connection recovery, request cancellation, verification timeout and minimal identity fields |
| Protected routes | Signed-out blocking, verification gating/retry/offline recovery, admin-role revocation, 401 query/mutation cleanup, resource-specific 403, navigation/focus/titles and protected 404 |
| Shared auth integration | Pending/session synchronization across consumers, offline failure without queued credentials, settled mutation cleanup, logout recovery, query cancellation and session expiry |
| Overview API | Documented status/limit queries, all-range totals beyond preview rows, invalid envelopes/statuses/locations/dates, cancellation and HTTP error propagation |
| Overview component/integration | Independent loading and failures, unavailable versus zero, complete empty state, explicit retry, retained stale values/timestamps, aged cache, offline recovery, IST dates across midnight, 401 cache cleanup, resource-specific 403 and existing section links |
| Overview browser | Populated previews/counts, loading, partial failure, retry, empty/stale feedback, section navigation and no horizontal overflow at 1440/768/390/320px |
| Orders validation/API | Exact decimal normalization and limits (including zero), invalid calendars, IST inclusive/exclusive boundaries, safe return links, supported filter parameters, order/status validation, strong/weak ETags, command headers, acceptance-trip reconciliation, rejection reason and rate-limit precedence |
| Order command lifecycle | Same-intent retry identity after interrupted creation, blocked changes while uncertain, duplicate-submit guard, discarded mutation data, corrected-input keys, logout and unmount isolation |
| Orders browser | Current-page search/source controls, server date filters, cursor pagination/return URL, creation, validated acceptance and Unassigned trip handoff, rejection dialog focus/Escape, stale-version refresh/review, same-key/body/version decision replay, input preservation, throttling, empty-list recovery and invalid-range blocking |
| Companies validation/API | Exact positive split normalization/total and preview boundaries, required contact fields, documented cursor queries, malformed/duplicate records, response identity, atomic creation payload and idempotency headers, protected errors and payout-rate validation |
| Company creation lifecycle | Same-key/body replay through throttling, synchronous duplicate guard, company-choice invalidation, discarded settled mutation data and logout/unmount isolation |
| Company integration/browser | Required/native-email validation and focus, exact split preview, company creation/detail, current-page search/status, cursor/return URL, loading/stale/empty recovery, separate payout failures/older-page recovery, invalid identities, safe return links and 401 cache cleanup/403 isolation |
| Partner provisioning validation/API | Native email/required field feedback, opaque password preservation, optional phone, company-scoped list/create contracts, membership/role validation, duplicate/cursor-loop rejection, safe response allowlists and idempotency/error propagation |
| Partner command lifecycle | Same-body/key replay through interruption/in-progress/throttling, synchronous duplicate guard, no credentials in mutation variables/results, settled cleanup, scoped invalidation and session/unmount isolation |
| Partner browser | Dialog focus/visibility/Escape/cancel cleanup, saved account refresh, validation/conflict review, uncertain replay, retry delays, list pagination/totals/loading/stale/empty recovery, company switching, 401 cleanup and resource-specific 403 recovery, overflow down to 320px |
| Driver API/integration | Documented status/online/cursor parameters, full-range totals, nullable application fields, malformed/duplicate/out-of-filter records, role/profile associations, private-field allowlists, cancellation, protected direct routes, safe return links and 401 cache cleanup/403 isolation |
| Driver browser | Active/pending/inactive/suspended views, current-page search, cursor/return navigation, server-filter pagination reset, application details and missing information, stale/empty/loading recovery, explicit throttled retries, unavailable/malformed responses, session expiry and overflow down to 320px |
| Private document API/lifecycle | Current-document pagination/completeness, driver/type/identity validation, masked-field allowlists, scan gates, swapped assets, safe fresh links, credential-free/no-store/referrer-free transport, MIME/signature/size checks, bounded streams, expiry, duplicate requests, cache exclusion, object-URL revocation, cancellation and late-response session isolation |
| Private document browser | Four current upload types, missing files only after complete pagination, independent/stale metadata failures, image/native PDF previews, modal focus/Escape, scan restrictions, denied/unavailable files, expired links/previews, throttled explicit retries, API 401 cleanup, loaded-preview session expiry and navigation cancellation |
| Activation API/command | Enabled pending account/four current clean uploads, missing/unavailable/swapped scan data, PATCH reason/idempotency headers, saved identity/status/history validation, fresh preflight, ambiguous replay through in-progress/throttling, definitive conflict review, duplicate guards, scoped invalidation, unmount/logout/new-session isolation and abandoned 401 handling |
| Activation browser | Required reason/focus, confirmation/Escape/cancel, account/document/scan blockers, disabled duplicate controls, current-state recheck before PATCH, identical replay reason/key, malformed success, conflict refresh/review, authoritative activation history, unchanged online state, API 403/401 handling, navigation cancellation and responsive overflow |
| Availability validation/API/query | IST midnight/leap-year/month boundaries, exclusive bounded ranges, complete opaque pagination, date/order/total validation, safe display fields, cancellation/late-result isolation, admin/driver/range query scopes, stale retention and protected errors |
| Availability integration/browser | Directory date snapshots and preserved search/cursor state, month/day URL navigation, notes/timestamps, available/unavailable/not-provided states, incomplete-page loading, stale refresh recovery, independent failures, retry delays, 401 cleanup/403 isolation, driver/month switching, assignment eligibility warnings and responsive overflow |
| Browser | Validation/keyboard/visibility, responsive layout, invalid login, rate-limit wait/retry, login/logout, storage isolation, expiry and reauthentication after reload, direct routes, active navigation, mobile drawer/keyboard behavior, verification recovery and logout/back-navigation isolation |

Payroll/statement financial transformations, assignment/statement workflows, server-wide order search/source filtering and real-backend integration remain future work in the [checklist](todo.md). Order amount/date boundaries, initial company payout splits and the Orders/Companies frontend workflows are now covered.

## CI

[Admin portal checks](../.github/workflows/admin-portal-checks.yaml) configures frozen installation, typecheck/build, lint, Vitest and Chromium browser tests for relevant PRs and pushes to `development`/`main`. Browser failure diagnostics are retained for seven days. The workflow uses read-only repository permissions and does not deploy the application.

The [first GitHub run](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/actions/runs/39025983340) reached the old three-minute browser-suite timeout after 94 passes, interrupting the remaining tests. The ten-minute budget still needs a GitHub rerun. An administrator must verify a successful run and configure the actual successful check as required protection under the project's Git workflow; this file does not configure branch protections.

The timeout fix was verified locally on 17 October 2026 using `CI=1 PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test`: **122 tests passed in 1.2 minutes** with two workers, including the interrupted mobile driver scenario. Build and lint also passed. This used installed Chrome with synthetic API responses; it does not establish a successful GitHub-hosted Chromium run or real-backend integration.

## Toolchain adoption record

Stable release tags and npm package engine/peer requirements were checked on **16 October 2026** before installation. The versions below are exact direct dependency pins; transitive resolutions belong to `pnpm-lock.yaml`.

| Tool | Pinned version | Official release evidence |
| --- | --- | --- |
| React Router | 8.4.0 | [Release](https://github.com/remix-run/react-router/releases/tag/react-router@8.4.0), [declarative APIs](https://reactrouter.com/start/declarative/installation) |
| Vitest | 5.0.5 | [Release](https://github.com/vitest-dev/vitest/releases/tag/v5.0.5) |
| jsdom | 30.1.3 | [Release](https://github.com/jsdom/jsdom/releases/tag/v30.1.3) |
| React Testing Library | 16.3.3 | [Release](https://github.com/testing-library/react-testing-library/releases/tag/v16.3.3) |
| DOM Testing Library | 10.4.2 | [Release](https://github.com/testing-library/dom-testing-library/releases/tag/v10.4.2) |
| user-event | 14.6.8 | [Release](https://github.com/testing-library/user-event/releases/tag/v14.6.8) |
| jest-dom | 7.0.1 | [Release](https://github.com/testing-library/jest-dom/releases/tag/v7.0.1) |
| Playwright Test | 1.64.1 | [Release](https://github.com/microsoft/playwright/releases/tag/v1.64.1) |

React Router 8.4.0 requires React/React DOM 19.2.7+ and Node 22.22.0+; the lockfile resolves React/React DOM 19.3.1, compatible with the existing Node/runtime range. Its declarative APIs use `react-router` directly. Vitest 5 supports Vite 8, and React Testing Library supports React 19. The package's Node engine range reflects jsdom's stricter requirement: Node 22.22.2+, 24.15.0+ or 26+. The existing local Node 26.5.0 runtime was retained and pinned in `.node-version` for repeatable validation/CI rather than upgrading the runtime during the test setup. See the [Vitest guide](https://vitest.dev/guide/), [Testing Library setup](https://testing-library.com/docs/react-testing-library/setup/) and [existing Node release](https://nodejs.org/en/blog/release/v26.5.0).

`pnpm-workspace.yaml` contains only exact release-age exceptions generated by pnpm for the verified stable Vitest/jsdom releases and Vitest companion packages; it declares no workspace topology. Keep it with the manifest/lockfile when reproducing installs. GitHub Actions use verified release tags for checkout 7.0.1, setup-node 7.1.0 and upload-artifact 7.0.2.

## Verification record

On 16 October 2026, using Node 26.5.0 and pnpm 12.5.1:

- Frozen dependency installation passed.
- `pnpm run test`: **207 tests passed across 17 files**.
- `PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test`: **68 tests passed**, covering desktop and mobile projects. Regression tests intercept company-choice requests as well as overview/auth requests; none depend on a running backend.
- `pnpm run build` and `pnpm run lint`: passed, including test typechecking.
- Browser checks cover the protected shell at desktop/mobile sizes and overflow at 1440px, 768px, 390px and 320px. Native drawer keyboard checks run with both desktop and touch browser settings.
- Overview screenshots use synthetic records and are saved under ignored `test-results/` directories. Desktop and narrow screenshots were visually reviewed. Narrow capture uses a tall viewport to avoid installed Chrome's full-page stitching artifacts; interaction/overflow checks still use normal 844/900px viewport heights.
- Partner provisioning dialog and failure screenshots use synthetic credentials, with passwords masked, and were visually reviewed at desktop/mobile sizes. Provisioning and account-list overflow checks cover 1440px, 768px, 390px and 320px; all partner scenarios run in both projects. Native modal focus checks allow the browser-chrome transition between Tab cycles while ensuring background controls remain inaccessible.
- Company directory, creation and profile screenshots use synthetic records and were visually reviewed at desktop and narrow sizes. All three company screens pass overflow checks at 1440px, 768px, 390px and 320px. Company browser scenarios run in both projects using intercepted responses; no running backend is involved.
- Orders list, creation, detail and trip-handoff screenshots also use synthetic records and were visually reviewed. List and creation overflow checks cover 1440px, 768px, 390px and 320px; trip handoff is checked at narrow width. No actual customer details or credentials are included.

Real-backend integration, the GitHub-hosted workflow and a Docker image build have not been verified by these checks.

On 17 October 2026, the driver directory/application-detail increment was verified using Node 26.5.0 and pnpm 12.5.1:

- `pnpm run test`: **248 tests passed across 19 files**, including 41 new driver API/integration checks.
- `PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test`: **78 checks passed**, including 10 new driver desktop/mobile scenarios. The navigation suite now intercepts driver lists so section navigation remains independent of a running backend.
- `pnpm run build` and `pnpm run lint`: passed, including test typechecking.
- Driver directory and pending-application screenshots use synthetic records and were visually reviewed at desktop and narrow widths. Both screens passed overflow checks at 1440/768/390/320px. Browser checks cover server filters, pagination/return state, missing information, retry delays, stale refresh failures, invalid responses, unavailable/forbidden details and session expiry.
- Private-document viewing, driver activation and availability/calendar are not implemented or verified by this increment. Real-backend integration, remote CI and Docker builds remain unverified.

The driver hooks and URL filters use the existing supported [React Query v5 query API](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) and [React Router search-parameter API](https://reactrouter.com/api/hooks/useSearchParams), checked against their official references on 17 October. No dependencies changed.

Later on 17 October 2026, private-document viewing was verified using the same Node/pnpm versions:

- `pnpm run test`: **298 tests passed across 21 files**, including 50 new document-service/preview-lifecycle tests.
- `PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test`: **94 desktop/mobile checks passed**, including 16 new document scenarios. API and signed-file requests use synthetic intercepted responses; no running backend/storage service is involved.
- `pnpm run build` and `pnpm run lint`: passed, including test and browser-spec typechecking.
- Current-upload and private-preview screenshots use synthetic documents and were visually reviewed at desktop/narrow widths. Overflow checks cover 1440/768/390/320px; image and native PDF rendering, modal focus/Escape, request cancellation, expiry cleanup and retry behavior are covered. PDF rendering is browser-dependent; these checks use Chromium desktop/mobile emulation, not physical mobile devices.
- Tests assert that storage requests carry no bearer token/cookies/referrer and that links/bytes stay out of ordinary Query/mutation caches. Hook tests cover duplicate guards, blob revocation, render failures, expiry, unmount/logout/session changes and abandoned 401 responses that must not clear a later session.
- Real attachment authorization, scanning, audit logging, direct HTTPS storage CORS/no-store headers, remote CI and Docker remain integration/release tasks. Driver activation and availability/calendar remain unimplemented.

The implementation uses the existing supported [React Query mutation lifecycle](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation), native [modal dialogs](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal) and [object-URL cleanup](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static), with [Playwright clock control](https://playwright.dev/docs/clock) for session-expiry coverage. Official references were checked on 17 October. No dependencies changed.

The initial-activation frontend was subsequently verified on 17 October 2026 with the same toolchain:

- `pnpm run test`: **335 tests passed across 23 files**, including 37 new activation service/command checks.
- `PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test`: **108 desktop/mobile checks passed**, including 14 new activation scenarios. The affected activation/driver subset also passed all 24 checks.
- `pnpm run build` and `pnpm run lint`: passed, including test and browser-spec typechecking. No dependencies changed.
- Activation readiness and confirmation screenshots use synthetic records and were visually reviewed at desktop/narrow widths. Overflow checks cover 1440/768/390/320px. Browser checks cover reason validation, modal focus/Escape, blocked duplicate submissions, fresh document checks, unknown-result replay through in-progress/throttled/malformed responses, definitive conflict review, saved history, scoped list refresh, API session handling and navigation cancellation.
- Mocked checks establish frontend behavior only. Final DEC-09 approval, atomic backend enforcement/audit/authorization, durable idempotent replay, actual activation, remote CI and release deployment remain open. Inactive/suspended reactivation and availability/calendar are outside this increment.

The supported [React Query mutation API](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation) and [QueryClient cache/invalidation methods](https://tanstack.com/query/latest/docs/reference/QueryClient) were checked against their official references on 17 October.

The availability/calendar frontend was then verified on 17 October 2026 using Node 26.5.0 and pnpm 12.5.1:

- `pnpm run test`: **385 tests passed across 27 files**, including 50 new calendar validation, service, query and component checks.
- `PLAYWRIGHT_CHANNEL=chrome pnpm exec playwright test`: **122 desktop/mobile checks passed**, including 14 new calendar scenarios. All API/storage responses are synthetic and intercepted.
- `pnpm run build` and `pnpm run lint`: passed, including test and browser-spec typechecking. No dependencies changed.
- Directory date snapshots and monthly-calendar screenshots were visually reviewed at desktop/narrow widths. Overflow checks cover 1440/768/390/320px. Browser coverage includes IST today across UTC midnight, directory search/cursor preservation, detail return links, month/day navigation, independent per-driver requests, partial pagination, missing dates, stale recovery, delayed retries, session cleanup and abandoned driver/month responses.
- Calendar checks assert read-only documented range requests, complete-page validation before missing-date claims, scoped caching and explicit refresh. Available dates remain separate from active/enabled eligibility; booked intervals and assignment conflicts are not supplied by the draft calendar DTO.
- These checks establish frontend behavior with Chromium desktop/mobile emulation. Real calendar authorization/data, backend integration, remote CI and release deployment remain unverified. Trip directory and assignment implementation remain next work.

The existing supported [React Query query API](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) and [React Router search-parameter API](https://reactrouter.com/api/hooks/useSearchParams) were checked against official references on 17 October for the calendar implementation.

The Companies increment uses the supported React Query v5 mutation/query lifecycle and React Router search-parameter APIs, checked against the [TanStack Query reference](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation) and [React Router reference](https://reactrouter.com/api/hooks/useSearchParams). No dependency changes were required.

Partner account integration, 17 October 2026: the live desktop/mobile company suite now provisions a real partner, reloads the account list and exercises restricted browser sign-in, verified password change, cookie removal, old-token denial, fresh sign-in/refresh, own-company access and admin-portal role denial. It uses the real API and disposable PostgreSQL with no interception. The partner API portion runs in a separate browser context, not a partner portal UI. Password validation is 15–128 characters with exact bytes preserved and normalized lowercase email; fast intercepted regressions remain separate. See [backend policy](../backend/partners.md).
