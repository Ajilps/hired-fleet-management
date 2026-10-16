# Admin portal testing

The saved test suites protect authentication, protected routing, the responsive admin layout and Operations Overview. They use synthetic fixtures and intercepted responses, so they do not establish that the backend implements authentication, authorization or summary queries.

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
| Browser | Validation/keyboard/visibility, responsive layout, invalid login, rate-limit wait/retry, login/logout, storage isolation, expiry and reauthentication after reload, direct routes, active navigation, mobile drawer/keyboard behavior, verification recovery and logout/back-navigation isolation |

Financial/date edge cases, order/assignment/statement workflows and real-backend integration remain future work in the [checklist](todo.md).

## CI

[Admin portal checks](../.github/workflows/admin-portal-checks.yaml) configures frozen installation, typecheck/build, lint, Vitest and Chromium browser tests for relevant PRs and pushes to `development`/`main`. Browser failure diagnostics are retained for seven days. The workflow uses read-only repository permissions and does not deploy the application.

The workflow has not been run on GitHub yet. An administrator must verify its first run and configure the actual successful check as required protection under the project's Git workflow; this file does not configure branch protections.

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
- `pnpm run test`: **84 tests passed across 7 files**.
- `PLAYWRIGHT_CHANNEL=chrome pnpm run test:e2e`: **24 tests passed**, covering desktop and mobile projects. Auth/navigation tests also intercept overview requests; none depend on a running backend.
- `pnpm run build` and `pnpm run lint`: passed, including test typechecking.
- Browser checks cover the protected shell at desktop/mobile sizes and overflow at 1440px, 768px, 390px and 320px. Native drawer keyboard checks run with both desktop and touch browser settings.
- Overview screenshots use synthetic records and are saved under ignored `test-results/` directories. Desktop and narrow screenshots were visually reviewed. Narrow capture uses a tall viewport to avoid installed Chrome's full-page stitching artifacts; interaction/overflow checks still use normal 844/900px viewport heights.

Real-backend integration, the GitHub-hosted workflow and a Docker image build have not been verified by these checks.
