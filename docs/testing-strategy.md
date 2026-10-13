# Testing strategy

**Status:** planned acceptance and regression tests. Only the existing API documentation checks can run today. No application, security or recovery tests are claimed as passed.

Use this guide with [requirements traceability](requirements-traceability.md), [security design](security-design.md) and [workflow contracts](workflows.md). Test IDs below provide stable references for issues and PRs.

## 1. What to test at each level

| Level | Focus | Owner/reviewer |
| --- | --- | --- |
| Documentation/contract | OpenAPI examples, snapshot parity, naming and links | Author plus knowledgeable teammate |
| Unit | Money, state gates, field validation and DTO mapping | Implementing developer plus another full-stack reviewer |
| Database integration | Real constraints, locks, rollback, uniqueness, ownership and queries | Full-stack team |
| API integration | HTTP status, sessions, company/driver scope, headers and retry semantics | Full-stack team with Flutter coordination |
| React/Flutter UI | Saved/error/loading states, input preservation, accessibility and low-bandwidth behavior | Relevant implementer plus integration reviewer |
| End to end | Partner → admin → driver → statement journey | Full-stack and Flutter team |
| Security/recovery | Abuse cases, private files, backups and incident procedures | Penetration tester and operational owner |

TypeScript checks and Prisma-generated types supplement runtime tests; they do not prove authorization, decimal serialization or database constraints. Validate/generate from the pinned model before backend checks.

Use a real isolated PostgreSQL test database for concurrency/constraint tests. Unit mocks or a different database cannot prove the planned PostgreSQL locks and partial indexes. Use a deterministic local heuristic policy and stub storage scanning/email outcomes; later maps adapters use stubs too. Never send test messages to real customers.

Run PostgreSQL and Redis test dependencies through isolated Docker configuration once implemented. Also verify the selected managed PostgreSQL version/driver/pool mode in synthetic staging; a local database test cannot prove provider connection limits, TLS or recovery. Keep each test run's data separate and never reset a shared/production database.

## 2. Checks available now

From the repository root:

```sh
git diff --check
cd docs/api
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
pnpm run bundle
```

`check` validates documentation and example invariants, not implemented endpoints. UI reference checks and manual review supplement it when design files change. Introduce application test commands with the scaffold PR; follow the existing test filenames in [naming conventions](naming-conventions.md).

## 3. Acceptance cases

All cases start **Planned**. Record actual results, commit, environment and evidence in the implementation PR or linked test record.

| ID | Scenario | Expected result |
| --- | --- | --- |
| QA-01 | Login, refresh rotation, reuse, logout and disabled account | Valid session works; old/revoked credentials fail; pending profile cannot execute trips |
| QA-02 | Company A partner/driver changes IDs and admin-only filters | No cross-company/other-driver rows, totals, reports or files; correct 403/404 behavior |
| QA-03 | Pending driver uploads four documents; scan pending/rejected; replacement fails | Only clean owned contextual files attach; numbers masked; previous current upload retained |
| QA-04 | Online toggle and calendar across dates | Availability saves independently of activation/connectivity and never cancels an assignment |
| QA-05 | Partner order and admin phone/WhatsApp order; invalid/unknown fields | Correct company/source ownership and strict route/schedule/contact validation |
| QA-06 | Accept/reject race and replay | One decision and at most one trip; required email intent once; opposing terminal action conflicts |
| QA-07 | Supplied/unknown distance, missing/invalid speed policy, rounding/overflow, override/clear, acceptance and frozen basis; later provider fallback | Correct rough/source labels; server-controlled positive inputs/evidence; no initial maps request; unavailable when necessary; overrides win; copied/frozen history does not recalculate |
| QA-08 | Initial assignment, pending driver, ongoing reassignment and old queued writes | Eligibility enforced; original start/expenses preserved; old writes denied; confirmation cleared |
| QA-09 | Start twice; offline start; optional selfie permission/upload failure | One server start time; no local start success offline; optional selfie policy respected |
| QA-10 | Positive expense, omitted category, edit/delete, no expenses and stale confirmation | Description required; zero/negative rejected; default other; every mutation invalidates confirmation |
| QA-11 | Partner-only reveal, wrong/expired code and lockout | No code in ordinary responses/logs; trip stays ongoing on failure; durable attempts and server retry delay |
| QA-12 | Concurrent closure, failure injection and lost response | Exactly one persisted payroll/report/credit; full rollback on precommit failure; authorized replay returns same result |
| QA-13 | Rate edit at closure, boundary prices and fractional rounding | Closure-effective rate; exact shares sum to amount; zero-price allowed; expenses excluded under working rule |
| QA-14 | Read a closed report/history after profile/rate/payment changes | Frozen version-1 payload unchanged; admin or authorized company/payroll owner reads it; receipt access reauthorized |
| QA-15 | Earnings total and credit pagination | Own immutable credits; full-range totals independent of page; no withdrawal/manual credit action |
| QA-16 | Generate completed month twice, regenerate draft, month boundary | One statement per company/month; correct local closure selection and copied payroll totals/version |
| QA-17 | Creator/other approvals in either order; same user, two noncreators, stale version | Only explicit creator-plus-one-other on frozen version verifies; third distinct approver rejected |
| QA-18 | Publish twice, unpublished partner read and email outage | One publication/intent; partner sees own published only; outage does not undo publication |
| QA-19 | Worker timeout/crash, expired/stale lease, provider failure and missing recipient | Recoverable claims; stale acknowledgement denied; bounded retries; sanitized failure/missing-recipient alert |
| QA-20 | All seven reports, one/many/all companies, dates, pagination and missing timestamps | Same scope for rows/counts/totals; explicit denominators/date bases; no invented success classification |
| QA-21 | Rate, amount, reassignment, approval and publication audits | Actor/action/time recorded; OTP, credentials and private file secrets absent |
| QA-22 | Narrow web, Android keyboard, enlarged text, low bandwidth and keyboard-only use | Essential actions reachable; meaningful status/error labels; no clipped input/actions or false saved state |
| QA-23 | Malicious input, mass assignment, upload spoofing, throttling and sensitive logs | No privilege escalation/injection or private-file leak; enforced server controls and sanitized output |
| QA-24 | Backup restore, deployment rollback and replay after recovery | Database/files/keys reconcile; no second wallet credit or unintended notification resend |
| QA-25 | P2 profile/document changes, concurrent replacement and upload failure | Only own editable fields; one current document per type; old version preserved until commit |
| QA-26 | Clean checkout, migrations, seed, service startup and release checks | Another teammate can reproduce documented setup; commands/checks match the implemented projects |
| QA-27 | Docker builds, environment/profile combinations, dependency readiness, restart and shutdown | Reproducible images; no baked secrets/public dependency ports; production excludes local PostgreSQL/dev mounts; transactions finish or roll back and worker claims recover |
| QA-28 | Company/user cache-key collision, filter changes, expiry, invalidation race and reassignment | Scoped results/totals; current access rechecked; permitted stale-display limits met; no cached authorization/rate used for financial writes |
| QA-29 | Managed PostgreSQL TLS, connection exhaustion, pool mode, migrations, closure locks and restore | Verified server identity; bounded connection use; one migration job; atomic closure/uniqueness and isolated recovery work on chosen service |
| QA-30 | Redis timeout/restart/memory pressure and any selected session/limiter/queue role | Bounded cache fallback/load; critical checks never bypassed; lost cache does not lose durable business/outbox/replay records; optional roles meet their agreed recovery policy |
| QA-31 | Pinned Prisma generation/build, model mappings, blank/prior-schema migrations, custom SQL retention and migration failure/recovery | Final API/worker images run; catalog names/types/precision/keys match DBML; CHECKs/partial indexes/triggers enforce invariants; upgrades preserve records; migration recovery is validated |
| QA-32 | Representative workload with 1,000 registered accounts and 100 simultaneous active users | Record latency/error/throughput and pool/lock/resource evidence against agreed DEC-23 criteria; closure/replay/company-scope correctness holds under load; no pass without agreed thresholds/duration |

QA-04/07/09 selfie/14 history/20/25 include P1/P2 features as mapped in [traceability](requirements-traceability.md). Shared P0 protections such as authorization, safe failure handling and immutable closure still apply even when an optional UI feature is deferred.

QA-27 through QA-30 cover the selected [infrastructure direction](infrastructure-plan.md). Session/limiter/Redis-queue subcases apply only if those roles are adopted; record an explicit scope decision for unused roles rather than claiming they passed.

For QA-07, 20.00 km at an illustrative 30.00 km/h gives 40 minutes; 20.01 km gives 41 after upward rounding. Test zero/negative/nondecimal distance rejection, omitted/null distance, invalid/missing policy and unrepresentable duration. Forged client speed/source/policy must be rejected. Clearing an override must restore the stored basis; changing configuration after acceptance/closure must not alter frozen results. These fixture speeds are not approved operating defaults. See [estimation](travel-time-estimation.md).

## 4. Financial and concurrency fixtures

Use the common synthetic accounts/data in [developer setup](developer-setup.md#6-minimum-seed-data).

| Trip amount | Driver/company split | Expenses | Expected driver/company shares |
| --- | --- | --- | --- |
| ₹10,000.00 | 30/70 | ₹150.00 | ₹3,000.00 / ₹7,000.00 |
| ₹0.00 | 30/70 | None, explicitly confirmed | ₹0.00 / ₹0.00 |
| ₹0.05 | 30/70 | None, explicitly confirmed | ₹0.02 / ₹0.03 with proposed half-up rule |

Assert database state, not only HTTP status. On successful closure, payroll, report, trip and credit identities agree and the wallet cache equals its ledger. On failed closure, none of those financial writes commit. Failed code-attempt accounting is checked separately.

Run simultaneous requests using independent database connections and a barrier so they overlap. Cover accept-versus-reject, reassignment-versus-expense/close, rate-edit-versus-close, expense-edit-versus-confirm, close-versus-close and concurrent statement approvals. Refresh/new intents use the latest ETag; replay of a committed command is resolved before a stale ETag while still rechecking authorization.

Run the same closure/replay tests through the real Prisma repositories and transaction context, including reviewed SQL helpers; database mocks cannot reveal a helper accidentally committing outside that context. Cover a duplicate request with the same key, a new key after closure, and replay after replay-record expiry/recovery: permanent uniqueness must still prevent a second credit. Verify rollback removes every required outbox intent with the financial writes, and external email starts only after commit. Exercise decimal boundaries and the existing API/report serialization from actual database results.

Test failures at each transaction stage and immediately after commit. For email, do not assert exactly-once inbox delivery: intent uniqueness is required, but a crash after provider acceptance can produce duplicate sends without provider idempotency.

Repeat the financial/authorization cases with Redis unavailable and with stale cache entries. Stop a container during an in-flight closure and verify one committed result or complete rollback, then safe replay. With the chosen provider, test locks/pooling and connection exhaustion using synthetic staging data. Exercise simultaneous cache misses without uncontrolled database connection growth.

## 5. End-to-end smoke journey

1. Partner A submits an order; Partner B cannot read it.
2. Admin accepts with ₹10,000 and assigns an active driver; one unassigned/assigned trip is created through the appropriate steps.
3. Driver starts, records ₹150 parking, confirms the saved list, and sees no close code in trip data.
4. Partner A deliberately reveals and shares the code. Driver closes online.
5. Driver sees one ₹3,000 credit; partner sees the frozen report with ₹150 shown separately.
6. Repeat the close command as a lost-response retry; no duplicate result is created.
7. For a completed billing month fixture, creator generates/submits the statement. Creator and another admin approve the same version, then an admin publishes.
8. Partner A sees the statement; Partner B cannot. Verify email intent/delivery separately.

Run on a test environment with a controllable server clock or completed-month fixture. Do not change production clocks or create fake real earnings.

## 6. Readiness and evidence

A feature is ready when its applicable cases pass, relevant client compatibility is checked, required independent review is recorded, and open decisions affecting it are resolved or explicitly deferred. A release needs every P0 requirement plus the security/recovery gates in the [deployment guide](deployment-guide.md).

Record test ID, source commit, environment/tool versions, expected/actual outcome and sanitized evidence. Mark results Passed, Failed, Blocked or Deferred with a reason; an unchecked box means no evidence, not success. Capacity scope is confirmed in DEC-35; agree remaining workload/latency/error/duration criteria in DEC-23 before treating load measurements as a release gate.

## 7. Capacity and load validation

The owner confirmed **1,000 registered accounts and 100 simultaneous active users** on 10 October 2026 (DEC-35). Registered accounts describe stored population; active users describe overlapping application use with realistic think time, not 100 database connections or a fixed requests-per-second target. No measured capacity or pass result exists yet.

Before QA-32, agree request mix, data/history volume, ramp-up and steady-load duration, acceptable latency percentiles, error rate and resource/alert limits under DEC-23. Use synthetic accounts across companies, realistic role proportions and read/write activity (dispatch, expense/closure, earnings/reports and worker processing). Record provider/plan, versions, replica/pool configuration and cache state so results can be reproduced.

Measure request latency, throughput/errors, PostgreSQL connection use and acquisition waits, lock waits/deadlocks, API/worker CPU/memory, outbox lag and cache behavior. Assert one credit per closed trip and company isolation during/after load. Include bounded cache-outage fallback and rolling-deployment pool overlap against the [connection budget](infrastructure-plan.md#3-managed-postgresql).

A **200-active-user stress run** may explore headroom and recovery from saturation; it is an assistant-proposed exercise, not an owner-confirmed acceptance requirement. Report its results separately and do not turn it into a required capacity target.
