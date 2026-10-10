# Admin portal implementation guide

Use the [screen index](screens.json), [screen references](references/), [shared CSS tokens](../shared/tokens.css) and [UI/UX specification](../../docs/ui-ux-specification.md). The index covers 102 screens; 94 have a local image. Frames without an export remain listed with `reference: null`.

Useful starting references: [overview](references/overview.png), [orders](references/orders.png), [active trip](references/trip-ongoing.png), [assignment](references/assign-driver.png), [driver application](references/driver-pending.png), [company](references/company-detail.png), [payroll](references/payroll.png), [statements](references/statements.png), [narrow overview](references/overview-mobile.png) and [design foundations](references/foundations.png).

| Area | Screens to build |
| --- | --- |
| Authentication | Sign in, initial password change, invalid credentials, throttled login, expired session |
| Overview | Operational counts, attention lists, empty/loading/partial failure states |
| Orders | Directory, entry, details, amount acceptance, rejection reason, validation and concurrent decisions |
| Trips | Directory, lifecycle detail, assignment/reassignment, amount and duration edits, frozen closed report |
| Drivers | Active/pending lists, application review, private documents, activation and availability calendar |
| Companies | Directory, company creation/profile, partner account provisioning and retry |
| Payroll | Current split, preview, validation, confirmation and rate history |
| Statements | Register, completed-month generation, draft review, two explicit approvals and publication |
| Reports | Billing issues, driver delays, client order volume/success, driver payouts, trips, orders and driver/staff work |

Suggested React page boundaries follow those areas. Reuse `OrderForm`, `TripSummary`, `DriverChooser`, `PrivateDocumentViewer`, `CompanyForm`, `SplitEditor`, `StatementLines` and `ApprovalPanel` with shared form/table/dialog primitives. Use drawers for contextual assignment and small edits; substantial trip and statement details use pages.

Apply the [workflow contracts](../../docs/workflows.md) when wiring API actions:

- Accepting an order with an amount creates one Unassigned trip. Driver assignment is a separate command. Show a saved result and link to the created trip.
- Pending drivers are ineligible. Activation and availability are separate. Private documents require authorised access.
- Reassignment before closure preserves the original start time and expenses. A replacement driver must reconfirm expenses; the previous driver loses operational access.
- Closed financial records are read-only. Keep expenses separate from commission and shares.
- Submitting a statement freezes its content and does not count as approval. Publication requires the creator's explicit approval and one distinct second admin's approval. Two noncreator approvals cannot substitute for the creator.
- Only the creator can regenerate an unsubmitted draft. Publication and email delivery have separate feedback.
- Filters must apply consistently to records and whole-range totals. Trips reports have Live, Daily and Monthly views. Delay/success definitions remain provisional.
- Preserve form input on recoverable failures. Refresh records after concurrent decisions or stale versions instead of replaying an action blindly.

Use the index's States, Dialogs and Responsive entries as the implementation checklist. Some narrow prototypes reuse desktop dialogs; design those controls responsively during implementation rather than copying their desktop dimensions.

Saved Penpot reference: **New File 1**, pages **Admin Portal**, **Responsive Web**, **Design System**; version **HireD Admin Web — Review Draft — 9 Oct 2026**. All example records are synthetic.
