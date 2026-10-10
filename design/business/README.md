# Business portal implementation guide

Use the [screen index](screens.json), [screen references](references/), [shared CSS tokens](../shared/tokens.css) and [UI/UX specification](../../docs/ui-ux-specification.md). The index covers 64 screens; 17 representative screens have local PNGs. Other states remain listed with `reference: null` and are specified in the workflow/screen contracts.

Useful starting references: [sign in](references/login.png), [overview](references/overview.png), [new order](references/new-order.png), [saved order](references/order-saved.png), [orders and trips](references/orders.png), [active trip](references/trip-ongoing.png), [revealed code](references/trip-code.png), [closed report](references/trip-closed.png), [statement list](references/statements.png), [statement detail](references/statement-detail.png), [narrow order form](references/mobile-order.png) and [design foundations](references/foundations.png).

| Area | Screens to build |
| --- | --- |
| Authentication | Sign in, initial password change, invalid credentials, session expiry and throttling |
| Overview | Company counts, active trip, latest orders, published statement, empty/loading/partial failure states |
| New order | Pickup/drop-off, IST schedule, service/vehicle notes, contact, duration estimate, review, submission and retry |
| Orders & trips | Current/history, date/status filters, received/accepted/rejected details and empty results |
| Active trip | Unassigned/Assigned/Ongoing views, driver details, estimate, progress and masked/revealed close code |
| Closed report | Frozen trip amount, recorded rates/shares, separate expenses and fetch failure |
| Monthly statements | Published directory, filters, totals, trip-wise details, empty results and fetch failure |
| Account | Company identity, account/help, sign out and responsive navigation |

Suggested React page boundaries follow those areas. Reuse `OrderForm`, `OrderReview`, `OrderStatus`, `TripProgress`, `CloseCodePanel`, `ClosedTripReport` and `StatementLines` with shared shell/form/table/card primitives.

Apply the [workflow contracts](../../docs/workflows.md) when wiring API actions:

- Company scope comes from the signed-in account. Every record query must use authorised company access; forms have no company selector.
- Business users submit trip requests. HireD confirms the amount when accepting an order and assigns the driver separately. An accepted order links to its trip.
- Display Received only after the save is confirmed. Preserve input on failure and use the same request identity when retrying to avoid duplicate orders.
- Duration is an estimate, may be unavailable and may be overridden by HireD. Show its source and update time. It does not represent continuous GPS tracking.
- Keep the close code masked until a deliberate reveal in an ongoing trip's detail. Hide it on navigation or session expiry. Share it with the assigned driver after completion. Keep it out of lists, URLs, notification previews and cached screens.
- Business users do not close trips or edit closed finances. Display the recorded trip amount and split; list expenses separately from commission and shares.
- Show only published monthly statements. Keep whole-month totals available outside the trip-line list. Each trip line must open its matching report.
- Order decision and statement publication emails are separate from the saved UI state. No email contains the close code.

Use the 390 px references for narrow layouts, the 320 px overview for essential content and the 768 px overview for tablet composition. Operational rows become record cards; statement lines become financial cards with persistent totals.

September's reference shows three complete trip lines. August and July examples in Penpot show one illustrative line and whole-month totals; the application must render the actual full response with pagination when needed. Prototype refresh buttons advance prepared states; real refresh actions only refetch server state. The six-digit code format remains a working assumption from the specification.

Saved Penpot reference: **business → Page 1**, version **HireD Business Web — Review Draft — 9 Oct 2026**. All example records are synthetic.
