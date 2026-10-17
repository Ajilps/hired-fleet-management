# Admin portal agent guidance

Applies to `admin-portal/` and its descendants. This is the HireD admin React application. Read the [portal README](README.md) for current implementation and setup; use the project documents below for product and contract requirements.

## Project references

Read the references relevant to the task rather than loading every document:

- [Naming conventions](../docs/naming-conventions.md) and [Git workflow](../docs/git-workflow.md): source names, commits, branches and PRs.
- [Developer setup](../docs/developer-setup.md) and [decision log](../docs/decision-log.md): dependency policy, toolchain choices and unresolved decisions.
- [Admin design guide](../docs/design/admin/README.md), [screen index](../docs/design/admin/screens.json), [screen references](../docs/design/admin/references/) and [UI/UX specification](../docs/ui-ux-specification.md): layouts, states, responsive behavior and accessibility.
- [Application workflows](../docs/workflows.md) and [security design](../docs/security-design.md): action gates, financial invariants, access boundaries and privacy.
- [OpenAPI source](../docs/api/openapi.yaml) and [API guide](../docs/api/README.md): routes, payloads, errors, concurrency and retry contracts.

Distinguish implemented behavior from proposals and examples. Some documents predate the frontend scaffold: `package.json`, the lockfile and source establish the current tooling; draft API contracts do not establish a running backend. When documents conflict or leave behavior undecided, identify the specific uncertainty instead of silently inventing a contract.

## Architecture and clean code

- Keep feature-based modules under `src/features/<feature>/`. Authentication, Operations Overview, Orders, Companies (list/creation/detail and partner provisioning) and Drivers (directory/application details, private documents, initial activation and availability calendar) are implemented frontend features. Trips currently provides only a read-only summary for order acceptance; create further modules when their functionality is needed.
- `src/app/` composes routes, the admin layout, screens and application-wide providers. `src/main.tsx` mounts the app and root lifecycle components.
- A feature owns its pages, components, API functions, hooks, stores, types, errors and validation. Add only the subdirectories the feature actually needs.
- Outside a feature, import its public `index.ts`. Inside it, use direct relative imports to avoid circular dependencies through its own entry file.
- Features may depend on `src/shared/`. Shared code must not import features or the app layer. Promote components to shared code when they are reused across features.
- API functions handle HTTP transport and response validation. Hooks coordinate requests and state. Stores own shared client state. Pages and components render UI and handle local interactions.
- Keep validation independent of React and HTTP. Preserve native input validity and accessible field feedback. Prefer focused functions and explicit types; avoid speculative wrappers, duplicated logic and unrelated refactors.
- Use PascalCase component functions and matching filenames; page names end in `Page`. Use kebab-case for other modules, CSS classes and feature directories. Hooks start with `use`; local event handlers start with `handle`. Follow the naming document for details.

## State ownership

- TanStack Query (`@tanstack/react-query`) owns server data, API request lifecycle and mutations. Use the stable client provided by `QueryProvider`; scope query keys by the relevant user/company and filters, and invalidate affected data after confirmed writes.
- Zustand owns shared client state. `useAuthStore` owns the in-memory admin session and expiry status. Subscribe with selectors. Keep API records in React Query rather than duplicating them in Zustand.
- Keep form fields, visibility toggles, field validation and local dialogs in React state. Use URL parameters for shareable search, filters, sorting and pagination as those screens are implemented.
- Login/logout use React Query mutations through `useAuth`. Preserve disabled pending controls, no automatic authentication retries, and no offline queuing of credentials. Reset settled auth mutations so request credentials and results are discarded.
- Keep access tokens in memory. The auth store has no persistence or devtools middleware. Browser refresh credentials live only in the API's HttpOnly cookie; restore/renew through the auth service with credentials, the custom CSRF guard and exact allowed origins. Serialize refreshes and ignore abandoned session results. Initial-password-change routing for future provisioned accounts remains unresolved.
- On login, successful logout, expiry and authenticated 401 responses, cancel outstanding queries and clear cached user data. Mount `AuthSessionMonitor` once at the root. Preserve explicit retry feedback if server logout fails. `RequireAdmin` gates the shell on current-admin verification; use the shared authenticated API client so 401 responses reach the query/mutation cache handlers. A resource-specific 403 must not automatically end the session.

## Design, API and business behavior

- Match the relevant saved design and its error/loading/empty/responsive states. Use `src/shared/styles/tokens.css`, copied from the [shared design tokens](../docs/design/shared/tokens.css). Keep intentional token changes consistent with their source. Preserve the supplied logo's proportions.
- Use persistent labels, keyboard-operable controls, visible focus, readable contrast, announced request feedback and mobile touch targets of at least 48px. Preserve input on recoverable errors; prevent duplicate submissions while pending.
- Use documented `/api/v1` operations and DTOs. Respect `Retry-After` and its documented JSON fallback; retry countdowns do not enforce server rate limits. Apply `If-Match` and `Idempotency-Key` only where the API contract declares them.
- Keep exact monetary values as contract decimal strings; do not calculate payroll with floating-point `Number` arithmetic. Use the documented timezone and interval rules for billing and filters.
- Preserve workflow distinctions: accepting an order creates an unassigned trip; assignment is separate; pending drivers are ineligible; closed financial records are immutable. Statements require the creator's explicit approval plus a distinct second admin's approval. Publication and email delivery have separate outcomes.
- Show saved success only after the server confirms it. Refresh authoritative data after conflicts; do not blindly replay stale financial or operational actions.
- UI role checks support usability; the backend must authorize every protected operation. Admin screens must not expose partner-only close codes. Keep credentials, codes, private documents and signed download URLs out of persisted stores, logs and public validation evidence. Use synthetic fixtures.
- Private document previews request fresh metadata and an authorized clean-file link on explicit open/retry. Keep signed URLs and bytes outside Query/mutation caches; fetch storage with no credentials, referrer or cache. Abort pending previews and revoke local object URLs on close/navigation/session loss/expiry. HTTPS storage CORS and server authorization/scan enforcement still require real integration.
- Initial driver activation implements the draft DEC-09 gate: enabled account and four current clean uploads. Recheck before a new PATCH, preserve first activation history and keep availability separate. An uncertain PATCH retains its reason/key for explicit replay without fresh eligibility checks; definitive failure requires refreshed review. Final policy approval and atomic backend enforcement remain open.
- Admin availability is read-only. Use IST calendar dates and exclusive range ends; complete pagination before labeling absent dates Not provided. Keep availability separate from online state and activation eligibility. An available date neither reserves time nor establishes absence of trip overlaps; the draft calendar supplies no booked intervals.

## Tooling and verification

Run commands from `admin-portal/`. Use the pnpm version pinned in `package.json` and a compatible Node runtime.

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm run build
pnpm run lint
pnpm run test
pnpm run test:e2e
```

- Install dependencies only when missing or changed. Follow the developer setup's stable-version and compatibility policy for intentional additions/upgrades. Keep manifest and owning `pnpm-lock.yaml` changes together; do not add competing lockfiles or a root workspace as incidental work.
- Do not introduce deprecated library/framework functions, APIs, component props, configuration options, packages or coding patterns. Verify support against official documentation and migration guidance for the installed version, then use the supported replacement compatible with the project's pinned dependencies.
- Do not suppress deprecation warnings or copy deprecated examples to bypass this rule. If the required supported API needs a dependency upgrade, document and validate that upgrade under the existing dependency policy before using it.
- After source changes, run build, lint and relevant Vitest tests. For UI or auth changes, run affected Playwright desktop/mobile checks where browser infrastructure is available. For documentation-only changes, check links and the diff.
- See [testing guidance](testing.md) for the configured Vitest/Testing Library and Playwright suites, supported versions, browser installation and CI. Co-locate meaningful feature tests, keep browser specs in `e2e/`, and reset stores/query clients/timers between tests. Do not rely on temporary QA files as repository tooling.
- Report checks actually run, their results and limitations. Distinguish intercepted/mock API checks from live authentication tests; other backend business workflows remain unavailable.
- `VITE_API_BASE_URL` is an API origin without `/api/v1`. Local Vite proxies `/api` to `http://localhost:3000`; production needs an explicit API origin or configured reverse proxy. Keep environment examples synthetic and document changed configuration.

## Git and documentation

- Inspect working-tree status and preserve existing work. Reuse the current suitable task branch. New work branches start from the latest `origin/development` and follow `<type>/<kebab-case-description>`; new features use `feature/`.
- Follow the documented commit format and PR flow into `development`. Do not commit or push directly to protected `development` or `main`; only the designated admin merges them.
- Keep changes focused. Update the README for architecture/setup changes and the relevant product/API documents when behavior or contracts change. Keep this file concise and maintain its links when files move.
