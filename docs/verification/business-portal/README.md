# Business partner portal — local verification

Implemented and verified 18 October 2026. Author checks only; remote CI, independent review and deployed-provider validation remain pending. Previous driver-document changes in the checkout were preserved.

## Evidence

| Check | Result |
| --- | --- |
| TypeScript/build and lint/source naming | Passed |
| Unit/component/transport tests | 41 passed |
| Intercepted desktop/mobile browser checks | 38 passed |
| Real API/PostgreSQL desktop/mobile partner journeys | 2 passed |
| Default/dev/apps Compose configuration | Passed |
| Frozen production Docker build | Passed with Node 26.11.1 / pnpm 12.11.2 |
| Non-root production Nginx, SPA deep link and compiled API origin | Passed |

Host checks used Node 26.5.0 and installed Chrome. The workflow pins the application runtime and Playwright browser installation. No skip or merge/approval is claimed. Disposable synthetic database and runtime containers/image were removed after checks.

## Browser screenshots

These are synthetic records. Overview/report screenshots use intercepted contract fixtures; company screenshots use the real API/PostgreSQL. No close code, password or issued credential is shown.

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Sign in | [View](desktop-sign-in.png) | [View](mobile-sign-in.png) |
| Overview · contract fixtures | [View](desktop-overview.png) | [View](mobile-overview.png) |
| Closed report · contract fixture | [View](desktop-closed-report.png) | [View](mobile-closed-report.png) |
| Company/account · real API | [View](desktop-company-live.png) | [View](mobile-company-live.png) |

[New order at 320 CSS pixels](new-order-320.png) verifies the narrow layout without horizontal page overflow. Browser checks also cover Escape dismissal/focus restoration for mobile navigation.

The real journey creates a unique synthetic admin/company/partner, enforces initial password change, requires fresh sign-in, restores via the API's private refresh cookie after reload, reads only the partner company, signs out and verifies account revocation. At that verification date the overview showed unavailable collections; M4 now supplies real order/trip totals. See [Orders verification](../orders/README.md) for current live scope.

Intercepted cases verify strict partner intake without supplied company/source/price, explicit IST conversion, retrying the same intent after response loss, filters/cursor pages, forbidden scope/unpublished results, unavailable versus empty states, throttling, startup recovery, private close-code reveal/hide/navigation/background cleanup and frozen exact financial totals with expenses separate.

Component regression checks also cover clearing the password after confirmation and safe session teardown during password setup. An earlier test exposed a null-session render during teardown; explicit guards and disabled queries now remove protected content safely.

## Reproduction and limits

See [business portal setup and test commands](../../../b2b-portal/README.md) and [CI workflow](../../../.github/workflows/b2b-portal-checks.yaml). Live tests require matching, explicit disposable loopback DATABASE_URL/TEST_DATABASE_URL. The real test database is synthetic and must be deleted after verification.

Real order/trip/report/statement services remain M4–M6 work. Their frontend contract tests do not establish real end-to-end operations or financial correctness of an unimplemented server. There is no production mock-data mode. The local Compose portal uses the real configured API and shows retryable unavailable states for those routes. Payments, admin approvals and private driver documents are outside the partner portal scope.

## Merge verification — 21 October 2026

Rechecked build, lint/source naming, all 41 unit/component/transport tests, all 38 desktop/mobile contract-fixture browser checks and both real API/PostgreSQL partner lifecycle journeys; all passed. Host verification used Node 26.5.0 and Chrome with a disposable migrated PostgreSQL database. The frozen production portal image built with Node 26.11.1 and pnpm 12.11.2; non-root Nginx served the direct `/company` SPA route. Pending M4–M6 services retain their explicit unavailable states; this merge does not claim a live order/trip/financial workflow. Remote CI and independent human review are reported separately in the PR.
