# Requirements traceability

**Baseline reviewed:** 10 October 2026. This maps requirements to proposed contracts and planned tests; it is not an implementation progress report.

The source is [HireD PRD v0.2, verified, dated 30 September 2026](https://github.com/shahid123s/buildathon-resources/blob/d66ff0d0a1cdfe49ad14d7a34bd286d369ddce30/hire_d_prd_doc.md), pinned to commit `d66ff0d0a1cdfe49ad14d7a34bd286d369ddce30`. That commit was resolved from the file history during this review. Future PRD updates need a deliberate comparison and baseline change.

## 1. How to read the matrix

- A/B/D IDs belong to the PRD. ADM/PAR/DRV IDs belong to the screen specification; they are not interchangeable.
- Operation IDs resolve in [OpenAPI](api/openapi.yaml). Database names resolve in [DBML](database/hired.dbml).
- QA IDs resolve in [testing strategy](testing-strategy.md#3-acceptance-cases).
- Every row is **Contract drafted / implementation not verified**. Record implementation PRs and test evidence when work lands.

The UI specification/designs are currently on `docs/ui-ux-specification`, not this branch. Screen mapping was checked against [that branch's pinned specification](https://github.com/Buildathon-HireD-Brototype-2026/BASAP/blob/dabe00d4e5a0d8315802ec41be48a140c472a930/docs/ui-ux-specification.md). Integrate its approved PR through the normal Git workflow; do not duplicate or silently recreate its files here.

## 2. Feature coverage

There are **32 feature requirements: 25 P0, 6 P1 and 1 P2** in this pinned PRD. P0 means required for the Phase 1 acceptance gate. Use PRD priority when draft operation markers differ.

### Admin

| PRD / priority | Area | Screens | API operation IDs | Main records | Planned tests |
| --- | --- | --- | --- | --- | --- |
| A-01 / P0 | Sign-in | ADM-01 | `login`, `refreshSession` | users, auth_sessions | QA-01, QA-23 |
| A-02 / P0 | Intake inbox | ADM-03 | `listOrders` | orders | QA-05, QA-02 |
| A-03 / P0 | Offline intake | ADM-04 | `createOrder` | orders, companies | QA-05 |
| A-04 / P0 | Order review | ADM-04 | `getOrder` | orders | QA-05, QA-02 |
| A-05 / P0 | Decision/pricing | ADM-04, ADM-06 | `acceptOrder`, `rejectOrder`, `updateTripAmount` | orders, trips, notifications | QA-06, QA-13, QA-19 |
| A-06 / P0 | Ongoing trips | ADM-05, ADM-06 | `listTrips`, `getTrip` | trips | QA-08, QA-22 |
| A-07 / P0 | Driver directory | ADM-08 | `listDrivers`, `listDriverAvailabilityDates` | drivers, driver_availability_dates | QA-04, QA-08 |
| A-08 / P0 | Dispatch | ADM-07 | `assignTripDriver`, `listTripAssignments` | trips, trip_assignments | QA-08, QA-12 |
| A-09 / P0 | Operational activation | ADM-08 | `listDrivers`, `listDriverDocuments`, `setDriverStatus` | drivers, driver_documents, file_assets | QA-03, QA-08 |
| A-10 / P0 | Company setup | ADM-09 | `createCompany`, `updateCompany`, `createCompanyPartner` | companies, company_users, company_payout_rates | QA-02, QA-05, QA-13 |
| A-11 / P0 | Split settings | ADM-10 | `createCompanyRate`, `listCompanyRates` | company_payout_rates | QA-13, QA-21 |
| A-12 / P0 | Statement review | ADM-11, ADM-12 | `generateStatement`, `submitStatement`, `approveStatement`, `publishStatement` | statements, statement_items, statement_approvals | QA-16, QA-17, QA-18 |
| A-13 / P1 | Reporting | ADM-13 | Seven report operations below | Operational/financial records | QA-20 |

### Business partner

| PRD / priority | Area | Screens | API operation IDs | Main records | Planned tests |
| --- | --- | --- | --- | --- | --- |
| B-01 / P0 | Scoped sign-in | PAR-01 | `login`, `getCurrentUser` | users, company_users | QA-01, QA-02 |
| B-02 / P0 | Order entry | PAR-03 | `createOrder` | orders | QA-05 |
| B-03 / P0 | Order/trip lists | PAR-02, PAR-04, PAR-05 | `listOrders`, `listTrips`, `getTrip` | orders, trips | QA-02, QA-05, QA-08 |
| B-04 / P1 | Duration estimate; maps integration later | PAR-03, PAR-05, ADM-06 | `createOrder`, `getOrder`, `getTrip`, `overrideOrderEstimate`, `overrideTripEstimate` | orders, trips | QA-07 |
| B-05 / P0 | Closed report | PAR-06 | `getTripReport` | trip_reports, trip_payroll_records | QA-14 |
| B-06 / P0 | Statement access | PAR-07 | `listStatements`, `getStatement` | statements, statement_items | QA-17, QA-18 |
| B-07 / P1 | Event emails | Supporting feedback | `acceptOrder`, `rejectOrder`, `publishStatement` enqueue intents | notifications | QA-06, QA-18, QA-19 |

Rejection email also belongs to P0 A-05 and cannot be deferred merely because B-07 is P1. The existing draft also enqueues acceptance/publication emails transactionally; retain that behavior unless an explicit scope decision changes the contract.

For B-04, the owner selected an initial [distance-based heuristic](travel-time-estimation.md), without a routing provider, under DEC-31. The draft API/DB/report schemas now represent its source/evidence. This does not complete the PRD's maps-based requirement or change its P1 priority; provider integration and its acceptance evidence remain later work.

### Driver

| PRD / priority | Area | Screens | API operation IDs | Main records | Planned tests |
| --- | --- | --- | --- | --- | --- |
| D-01 / P0 | Sign-in | DRV-01 | `login`, `refreshSession` | users, auth_sessions | QA-01 |
| D-02 / P0 | Identity uploads | DRV-02 | `uploadFileAsset`, `attachOwnDriverDocument` | driver_documents, file_assets | QA-03 |
| D-03 / P1 | Availability | DRV-03 | `setOwnAvailability`, `setOwnAvailabilityDate` | drivers, driver_availability_dates | QA-04 |
| D-04 / P0 | Assignments | DRV-03, DRV-04 | `listTrips` | trips, trip_assignments | QA-08 |
| D-05 / P0 | Trip detail | DRV-04 | `getTrip` | trips | QA-02, QA-08 |
| D-06 / P1 | Selfie | DRV-05 | `attachTripSelfie` | trip_selfies, file_assets | QA-09, QA-23 |
| D-07 / P0 | Start | DRV-04 | `startTrip` | trips | QA-09 |
| D-08 / P0 | Expenses | DRV-06 | `createTripExpense`, `updateTripExpense`, `deleteTripExpense`, `confirmTripExpenses` | trip_expenses, trips | QA-10 |
| D-09 / P0 | Code closure | DRV-07, DRV-08, PAR-05 | `revealTripCloseCode`, `closeTrip` | trips, trip_payroll_records, trip_reports, wallet_transactions | QA-11, QA-12, QA-13 |
| D-10 / P1 | Completed history | DRV-09 | `listTripReports`, `getTripReport` | trip_reports, trip_payroll_records | QA-14 |
| D-11 / P2 | Profile/documents | DRV-11 | `updateOwnDriverProfile`, `replaceOwnDriverDocument` | users, drivers, driver_documents | QA-25 |
| D-12 / P0 | Earnings | DRV-10 | `getOwnWallet`, `listOwnWalletCredits` | wallet_accounts, wallet_transactions | QA-12, QA-15 |

### Seven reporting operations

| Report | Operation ID | Verification |
| --- | --- | --- |
| Billing issues | `getBillingIssuesReport` | QA-20: missing/mismatched records and amounts |
| Driver delays | `getDriverDelaysReport` | QA-20: scheduled basis and null starts |
| Client volumes | `getClientVolumesReport` | QA-20: explicit denominators |
| Driver payouts | `getDriverPayoutsReport` | QA-20: payroll/credit reconciliation |
| Trips | `getTripsReport` | QA-20: live/daily/monthly basis |
| Orders | `getOrdersReport` | QA-20: creation basis and outcomes |
| Driver/staff work | `getDriverWorkReport` | QA-20: assignment versus closure basis |

## 3. Cross-cutting acceptance

| Area | Contract reference | Planned evidence |
| --- | --- | --- |
| Authorization/privacy | [Security design](security-design.md) and operation ownership rules | QA-01, QA-02, QA-03, QA-23 |
| Auditability | [Workflow reporting/access/audit](workflows.md#8-reporting-access-and-audit) | QA-21 |
| Financial reliability | [Atomic closure](database/database-design.md#atomic-closure-and-financial-correctness) | QA-12, QA-13, QA-15 |
| Responsive/low-bandwidth use | Pinned UI specification and [testing](testing-strategy.md) | QA-09, QA-22 |
| Secure storage | [Private files](api/README.md#private-files) | QA-03, QA-23, QA-24 |
| Setup/release/recovery | [Setup](developer-setup.md), [deployment](deployment-guide.md), [operations](operations-runbook.md) | QA-24, QA-26 |
| Docker, Redis and managed PostgreSQL | Owner-selected [infrastructure plan](infrastructure-plan.md), DEC-26 through DEC-30; supports PRD reliability/privacy rather than new feature priorities | QA-27 through QA-30 |

## 4. Integration gaps

These are review tasks, not permission to invent endpoints or rewrite existing contracts.

| ID | Gap | Required next action |
| --- | --- | --- |
| GAP-01 | Provisioned-account first-login client screens | DEC-03 owner chose mandatory change for partners. `changeOwnPassword` and restriction/session invalidation are implemented and tested; partner portal/admin-provisioned-account screens remain pending. See [policy](../backend/partners.md) |
| GAP-02 | UI specification/designs are not integrated into this readiness branch | Merge the approved UI/UX PR through `development`; then verify local links and final screen mappings |
| GAP-03 | API priority metadata marks driver availability/history operations P0 while PRD interaction priorities are P1 | Align metadata or explicitly record that the implementation supplies an underlying shared capability early; do not silently change PRD scope |
| GAP-04 | UI tables include source/search filters and report exports not fully represented by current API queries/downloads | Agree required filters/export formats under DEC-19/24; update OpenAPI and clients together |
| GAP-05 | HTTP replay registry is now represented and implemented in the [command foundation](../backend/commands.md); trip aggregate version and upload context remain pending | DEC-05/06: consume the durable boundary and add module-owned version/context migrations with affected workflows; foundation tests do not prove trip/upload integration |
| GAP-06 | Browser refresh transport and public driver entry mechanism are provisional | DEC-03/08: settle before building authentication/onboarding clients |
| GAP-07 | PRD reassignment wording is broader than draft pre-close-only behavior; statement visibility also needs clarification | Resolve DEC-14/17 before finalizing those acceptance tests |
| GAP-08 | Pinned UI specification still predates the initial heuristic/source-evidence additions; ERD PDF refreshed and verified on 10 October 2026 ([export record](database/erd-export.md)) | Update intake distance input, rough/admin/unavailable labels and client enum handling against the revised OpenAPI/DBML; DEC-32 still needs speed/limits and future provider policy. PDF refresh completes only the export portion of this gap |

The matrix covers the pinned feature list. It does not prove every UI field/query or nonfunctional limit is complete. During implementation, add a PR/test-evidence reference to the relevant requirement and resolve affected gaps before claiming it delivered.
