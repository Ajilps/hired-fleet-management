# Orders workflow verification — 22 October 2026

M4 implementation: partner/admin order intake, versioned atomic acceptance/rejection, one unassigned trip, encrypted close-code material, company-contact outbox, separate local capture worker, trip/history reads and admin notification/audit operations. DEC-04/20 choices were explicitly accepted by the project owner. This evidence is local author verification; independent review and remote CI are recorded separately in the PR.

| Check | Result |
| --- | --- |
| Prisma validation/generation, backend build/typecheck/lint/naming | Pass |
| Blank/repeated PostgreSQL migration deployment | Pass |
| Populated prior-schema upgrade and preserved identity/company/session | Pass |
| Full backend unit/HTTP/real PostgreSQL tests | 189 pass |
| Admin production build/lint and unit suite | 443 pass |
| Partner production build/lint/naming and unit suite | 41 pass |
| Affected admin Orders/Overview fixture browser regressions | 18 pass |
| Partner fixture browser regressions | 38 pass |
| Real cross-portal Orders plus partner lifecycle journeys, desktop/mobile | 4 pass |
| OpenAPI lint and 85-operation contract checks | Pass; lint reports 8 composition warnings |
| Pinned production Docker build / compiled real HTTP workflow / graceful stop | Pass; exit 0 |
| Default, dev and apps Compose configuration | Pass |

The real browser Orders journey provisions synthetic company/partner credentials, completes password setup, submits an order in the partner UI, accepts it in the admin UI with an exact amount, opens the same unassigned trip in both portals and restores it after reload. A second request is rejected with its reason visible to the partner and a durable notification intent. Admin manual intake exercises its separate company/source DTO. Another company's identity cannot read the order/trip. Desktop and 390px mobile journeys assert no page overflow. No requests in this live suite are intercepted.

PostgreSQL checks separately cover forged scope/unknown fields, current membership/account checks before replay, stable cursor totals, stale/weak/missing ETags, accept/reject and duplicate-accept races, same-command/lost-response recovery, transaction failure after trip creation, missing recipients, and deferred one-trip/company integrity. Worker checks cover simultaneous claims, crash after capture acceptance, immutable capture identity, expired/stale acknowledgements, bounded backoff/exhaustion, sanitized failures and audited manual retry without erasing attempt history.

Host checks use installed Node 26.5.0 and Chrome; the production Docker build uses pinned Node 26.11.1/pnpm 12.14.0. Test services contain synthetic data only. Capture transport writes private JSON locally and sends no SMTP/customer email; production delivery remains unimplemented. Assignment/start/expenses, code reveal and 5-attempt/15-minute lockout enforcement, closure/payroll/wallet and statements remain M5/M6. Stored distance has unavailable estimates until DEC-32 policy is selected.

Reproduce: start disposable PostgreSQL with CREATE DATABASE permission; generate/deploy migrations; set matching DATABASE_URL/TEST_DATABASE_URL. Run backend `test` and `test:integration`; admin build/lint/test and selected browser specs; partner build/lint/test, `test:e2e`, and `test:e2e:live`. The cross-portal suite additionally requires installed admin dependencies. See [Orders policy](../../../backend/orders.md) for keys/worker/retry operation.

## Synthetic real-API screenshots

| Surface | Desktop | Mobile |
| --- | --- | --- |
| Admin accepted trip | [View](desktop-admin-accepted-trip.png) | [View](mobile-admin-accepted-trip.png) |
| Partner shared trip | [View](desktop-partner-unassigned-trip.png) | [View](mobile-partner-unassigned-trip.png) |

Screenshots contain synthetic route/contact data and no close codes or credentials.
