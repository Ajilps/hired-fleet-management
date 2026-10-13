# Driver mobile app design

Android driver app designs for HireD, using the shared admin/business visual system. The editable design is saved in Penpot's **mobile app → Page 1**. Use the [screen index](screens.json), [screen references](references/), [shared design tokens](../shared/tokens.css), [UI/UX specification](../../docs/ui-ux-specification.md) and [workflow contracts](../../docs/workflows.md) during implementation.

The base screen is 390 × 844. Long forms and trip details are full-content scroll references. Home, History, Earnings and Profile use bottom navigation. Focused task pages use a back action. Include safe areas, keyboard-aware scrolling and visible actions above the keyboard in the actual app. Keep bottom navigation outside the scrolling content region. The designs also include a 320 px home, enlarged-text home, expense-entry keyboard and numeric close-code keyboard. Reference dimensions are layout examples, not hard-coded device restrictions.

| Group | Screens and behaviours |
| --- | --- |
| DRV-01 | Sign in, proposed driver application, pending activation, invalid credentials and session expiry |
| DRV-02 | Driving Licence, Aadhaar, PAN and PCC; upload source, capture/preview, progress, invalid file and interrupted upload |
| DRV-03 | Assigned-trip home, no assignments, loading, cached/disconnected view, availability and upcoming-day calendar |
| DRV-04 | Assigned/ongoing trip, contact, estimated duration, starting, offline start and reassigned/unavailable state |
| DRV-05 | Trip selfie capture, preview, upload success, camera denial and interrupted upload; P1 |
| DRV-06 | Expense list, add/edit/delete, optional receipt, validation, unsynced draft, final confirmation, empty confirmation and reconfirmation after changes |
| DRV-07 | Numeric close-code entry, wrong code, lockout, interrupted-result check and retry |
| DRV-08 | Server-confirmed closure, recorded driver share and links to earnings/report |
| DRV-09 | Completed/credited trip history, date filter, empty results and frozen reports; P1 |
| DRV-10 | Total credited earnings, immutable per-trip credits, post-close update, empty and failure states |
| DRV-11 | Profile, private documents, masked previews, contact edit and versioned replacement with original retained on failure; edits/replacements are P2 |

Use the index's `priority` as the proposed scope marker. Authentication/application screens do not establish public registration policy. Whether a selfie must block starting remains unresolved; these designs expose it as a separate action. Document replacement/profile editing are proposed P2 features.

## Implementation rules

- The current assignment is server-owned. There is no driver accept/reject step. Refresh authoritative trip state on foreground entry and before retrying writes.
- Activation grants operational access. Availability and network connectivity are separate states; becoming unavailable does not cancel an assigned trip.
- Cached data is read-only and visibly dated. Starting, expense confirmation and closure require connectivity.
- Expenses require a positive INR amount and description. Category and receipt are optional. Local drafts remain labelled Unsynced and cannot satisfy confirmation.
- Any expense mutation or reassignment clears confirmation. Confirm the final saved list, or explicitly confirm No expenses, before closing.
- The business contact reveals and shares the close code. The driver enters it into one labelled numeric field. Never fetch the code in a driver trip response or persist it in ordinary storage. Six digits are a working design assumption; expiry and lockout limits come from server policy.
- Wrong codes keep the trip Ongoing. An interrupted close response shows Checking before any success or earnings. Retry using the same operation identity; a confirmed existing closure must not create a second credit.
- Display recorded financial values only after closure is confirmed. A ₹10,000 trip at a 30% driver share credits ₹3,000. Expenses stay separate from that share. Earlier shares are labelled Estimated.
- Earnings are total credited records, with offline payments. There is no withdrawal, debit or manual-credit action.
- Reassignment removes the previous driver's write access and requires the replacement to reconfirm retained expenses. Remove unauthorised queued writes with an explanation.
- Keep private document access authorised. Existing uploads remain attached until a replacement is saved. Example identities/document numbers are masked and synthetic.

## Reusable mobile components

Map shared colours, spacing and typography into the mobile theme. Main input/body text uses 16 px, supporting labels 12–14 px, page headings 24–28 px and financial highlights 28–36 px. Touch targets are at least 48 × 48 px. Allow text enlargement, input focus, accessible errors and reduced-motion preferences.

Suggested components: AppBar, BottomNavigation, AvailabilityCard, AssignmentCard, RouteSummary, ContactCard, DurationEstimate, DocumentUploadRow, UploadProgress, CameraPreview, ExpenseRow, ExpenseForm, ExpenseConfirmation, CloseCodeInput, CreditSummary, TripHistoryCard and FeedbackPanel. The [outline SVG icons](icons/) can be adapted to the mobile framework's icon renderer.

## Prototype review

Named flows cover sign-in, application/documents, assignment-to-earnings, expense confirmation/closure, incorrect-code retry, disconnected mode, history, profile/documents and keyboard/narrow review.

Prototype actions navigate between prepared examples; fields, uploads and backend actions are not implemented. Variant flows illustrate independent saved states and do not simulate a shared persistent application session. A real back action should preserve the caller's context, and real refresh should refetch rather than advance a lifecycle. Camera artwork is an illustrative vector placeholder, not a real captured photo. All trip and earnings data is synthetic.

The project folder contains implementation references only. Penpot generation scripts, export scripts, audit logs and review montages are kept outside the project.
