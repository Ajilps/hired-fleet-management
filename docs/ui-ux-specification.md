# HireD UI/UX Specification

**Scope:** Phase 1 MVP — Admin portal, B2B Partner portal and Driver Android app.

**Status:** proposed design specification, prepared 6 October 2026. This document defines screens and interaction contracts; it does not claim that designs are approved, applications are implemented or usability checks have passed.

**Related contracts:** [Application workflows](workflows.md), [database design](database/database-design.md), [PRD validation and open decisions](database/prd-validation.md), [naming conventions](naming-conventions.md) and [Git workflow](git-workflow.md). Use the existing business vocabulary and lowercase stored statuses; user-facing labels may use title case. Resolve a conflict with these contracts explicitly rather than silently introducing different behaviour.

## 1. Design basis and objectives

The user-supplied [Lovable reference](https://id-preview--29526d21-889b-410d-affc-7d0297827ba6.lovable.app/) was inspected on its Dashboard, B2B Trips and Invoicing screens. Access may require a fresh owner-issued share link. Access tokens must not be committed to documentation.

Observed visual language: a white sidebar approximately 256 px wide, an indigo selected navigation item, a white search/notification bar, a pale grey canvas, rounded white cards, thin dividers, restrained shadows, compact operational tables, Inter typography and soft status badges. Partner and driver layouts in this specification are proposed extensions of that visual language; they were not observed in the reference.

The interface should help each user identify what needs attention, understand the current state and complete the next authorised action. It must distinguish an order from its accepted trip, tentative earnings from recorded earnings, and a saved action from pending network activity.

Reference-only credit limits, credit blocking, receivable ageing, CRM lead qualification and collection tools are outside this specification. Phase 1 also has no payment gateway, withdrawal action, manual wallet credit, continuous GPS tracking, driver accept/reject step, cancellation/reopening or post-close financial editing workflow.

## 2. Shared visual system

### 2.1 Colour tokens

The OKLCH values below were extracted from the rendered reference's theme. HEX values are rounded sRGB conversions. They are a reference-derived palette, not a claim of independently approved brand values. Use shared tokens across all three applications.

| Semantic token | HEX | Reference OKLCH | Use |
| --- | --- | --- | --- |
| Primary | `#5055F7` | `oklch(55% .235 274)` | Main CTA, selected navigation, focus accent |
| Primary soft | `#EBEFFF` | `oklch(95.5% .025 274)` | Contextual actions, selected surfaces |
| Primary soft text | `#3A3DC1` | `oklch(45% .2 274)` | Text on primary soft |
| Background | `#F7F9FC` | `oklch(98.2% .004 260)` | Application canvas |
| Surface | `#FFFFFF` | `oklch(100% 0 0)` | Cards, sidebar, top bar, dialogs |
| Text | `#111826` | `oklch(21% .03 264)` | Headings and body |
| Text secondary | `#697281` | `oklch(55% .025 260)` | Supporting labels |
| Surface muted | `#F1F4F8` | `oklch(96.5% .006 260)` | Search, neutral badges, grouped fields |
| Border | `#E1E4E9` | `oklch(91.8% .008 260)` | Dividers and decorative outlines |
| Success | `#009956` | `oklch(60% .15 155)` | Positive state indicator |
| Success soft | `#DCF9E5` | `oklch(95.5% .04 155)` | Positive badge background |
| Warning | `#E89D00` | `oklch(75% .16 75)` | Attention indicator |
| Warning soft | `#FFF2CE` | `oklch(96.5% .05 85)` | Attention badge background |
| Warning text | `#321C00` | `oklch(25% .06 75)` | Readable warning copy |
| Danger | `#DF202E` | `oklch(58% .22 25)` | Destructive action and failure indicator |
| Danger soft | `#FFEBE8` | `oklch(96% .03 25)` | Failure badge background |
| Information | `#0A8FD1` | `oklch(62% .14 240)` | Informational indicator |
| Information soft | `#DFF3FF` | `oklch(95.5% .03 240)` | Informational badge background |
| On primary | `#FCFCFC` | `oklch(99% 0 0)` | Primary button text |

Status colour is never the sole source of meaning. Validate each actual foreground/background combination. Where base green, amber or blue fails text contrast, use a darker semantic text variant while retaining the pale background and reference hue. The light border token is decorative; controls needing a visible boundary require a suitably contrasting outline or another clear affordance.

### 2.2 Typography, spacing and shape

| Element | Proposed treatment |
| --- | --- |
| Font family | Inter; system sans-serif fallback |
| Page heading | 24–28 px, weight 700 |
| Section/card heading | 14–16 px, weight 600–700 |
| Body, fields and controls | 14–16 px; mobile input text normally 16 px |
| Supporting label | 12–13 px, sufficient contrast |
| KPI number | 28–32 px, weight 700 |
| Amounts | Tabular numerals, right aligned in tables |
| IDs | Optional monospace treatment; do not truncate indistinguishably |
| Spacing | 4 px base; 8/12/16/24/32 px steps |
| Page padding | 24–32 px desktop; 16 px mobile |
| Corner radius | Approximately 12 px controls; 12–16 px cards; pill badges |
| Elevation | Fine border plus subtle shadow; stronger elevation for overlays only |
| Web controls | Normally 40–44 px high |
| Mobile touch targets | At least 48×48 px, including icon hit areas |

Use the supplied official HireD logo with preserved proportions. Until it is available, use a typographic placeholder identified in design annotations. Use one outline icon family. Reserve indigo for primary emphasis; avoid competing primary actions within the same action group.

## 3. Information architecture and responsive layout

| Surface | Navigation | Scope |
| --- | --- | --- |
| Admin web | Overview, Orders, Trips, Drivers, Companies, Payroll Settings, Monthly Statements, Reports | All companies or selected companies; all admins share one role |
| Partner web | Overview, New Order, Orders & Trips, Monthly Statements; account menu | Signed-in company's records only |
| Driver mobile | Home, History, Earnings, Profile; availability reachable from Home/Profile | Own profile, current assignments and authorised completed history |

Design desktop reference frames at 1440×900, tablet examples at 768 px width and narrow web examples at 390 px width. Design Android frames at 390×844 with safe areas and a visible keyboard variant. Check essential content at 320 px width and with enlarged text. These dimensions are design proposals, not device restrictions.

Web uses a white sidebar, white top bar and pale main canvas. Header places title/subtitle on the left and contextual actions on the right. KPI cards use four columns when space permits, two on intermediate layouts and one on narrow layouts. Operational tables sit inside white cards with a search/filter toolbar and pagination.

On smaller web layouts, navigation becomes a drawer and actions wrap without clipping. Convert wide rows into cards or a focused detail view, preserving ID, route, status, schedule and next action. Complex financial tables may have a labelled horizontal-scroll region with totals available outside it. Filters remain reachable and show their active count.

Do not place a company selector in partner forms. Driver bottom navigation remains visible on primary screens; focused forms may use a back control and sticky action area above the keyboard. Global search, notifications and exports must remain scoped to the signed-in role.

## 4. Status labels and action gates

| Domain / stored status | Display label | Available action or meaning |
| --- | --- | --- |
| Order `received` | Received | Admin may accept with amount or reject with reason |
| Order `accepted` | Accepted | Link to the created trip; do not repeat the decision |
| Order `rejected` | Rejected | Show recorded reason; no acceptance action |
| Trip `unassigned` | Unassigned | Admin assigns an active driver |
| Trip `assigned` | Assigned | Current driver starts; admin may reassign/edit amount |
| Trip `ongoing` | Ongoing | Current driver records/confirms expenses and enters close code; admin may reassign/edit amount |
| Trip `closed` | Closed | Read frozen report/earnings; no execution or financial editing |
| Statement `draft` | Draft | Creator may review, regenerate and submit |
| Statement `pending_verification` | Pending Verification | Creator plus one distinct other admin explicitly approve frozen content |
| Statement `verified` | Verified | Admin may publish after rechecking required approvals |
| Statement `published` | Published | Partner may view; content remains frozen |

Proposed badge mapping: neutral for Received/Draft, amber for Unassigned/Pending Verification, indigo for Assigned/Accepted, blue for Ongoing, green for Closed/Verified/Published and red for Rejected. Include text and optional icon. Availability and network connectivity are separate indicators and do not change trip status.

A disabled action needs a nearby explanation. Show actions only to eligible roles and records; the backend still validates access and state. Never use a generic status dropdown to bypass lifecycle commands.

## 5. Screen inventory

Screen IDs below identify design frames, not API endpoints or PRD requirement IDs. Priority references follow the existing reviewed PRD mapping; additional UI presentation choices remain proposed.

### 5.1 Admin portal

| Screen ID / screen | Content and interactions | Critical variants / requirement coverage |
| --- | --- | --- |
| ADM-01 Login | Email/password, visibility toggle, submit; initial password change for provisioned accounts where required | Invalid credentials, throttled login, expired session; A-01 |
| ADM-02 Overview | Counts for orders awaiting decision, ongoing/unassigned trips and statements awaiting approval; attention lists; refresh/time | Empty operations, partial load failure, stale data; supporting navigation |
| ADM-03 Orders | ID, company, route, schedule, source/status; search, company/source/date/status filters; Create Order | Received/Accepted/Rejected; A-02/03/04 |
| ADM-04 Order form/detail | Company on admin entry, route, schedule, service/vehicle notes, contact, source; amount on acceptance; reject dialog | Missing fields, amount error, required rejection reason, concurrent decision; A-03/04/05 |
| ADM-05 Trips | ID, company, route, schedule, driver, status, available estimate; search/filters/pagination | No driver, stale list, scope filters; A-06/08 |
| ADM-06 Trip detail | Lifecycle timeline, driver, route/contact, amount, estimate/override, expenses, assignment/change history and closed report | Assigned/Ongoing/Closed; read-only finances after closure; A-05/06/08, B-04 |
| ADM-07 Assign/reassign | Search active drivers, availability/calendar, selection and confirmation; ongoing reassignment warning | Pending drivers ineligible, no candidates, schedule warning, concurrent closure; A-07/08 |
| ADM-08 Drivers and application detail | Active/Pending directory, online/calendar state, four private document previews, operational Activate action | Missing documents, unavailable private file, activation pending; A-07/09 |
| ADM-09 Companies and partner accounts | List/detail/create, company contact/profile, partner provisioning and required split | Missing/invalid split, account-provisioning failure; A-10 |
| ADM-10 Payroll settings | Company split, calculation preview, old/new values and rate history | Percentages outside range or not totalling 100%; A-11 |
| ADM-11 Monthly statements | Company/month, status, trip count/totals; generate completed month; filters | No eligible trips, duplicate generation, unfinished month; A-12 |
| ADM-12 Statement detail | Frozen lines/totals, creator, explicit approval slots/times, submit/approve/publish | Missing creator approval, same-admin retry, occupied second slot, stale content; A-12 |
| ADM-13 Reports | Seven report types, date/driver/all-or-selected-company filters, totals and applicable export | Provisional metrics, empty results, pagination with whole-range totals; A-13 |

Use drawers for contextual assignment and small edits; use full pages for trip/statement details containing substantial review work. Destructive rejection requires a distinct labelled dialog. Accepting an order shows the saved result and a link to its new Unassigned trip.

The reports are Billing Issues, Driver Delays, Client Order Volume/Success, Driver Payouts, Trips, Orders and Driver/Staff Work. Trips has Live, Daily and Monthly views. Live means refreshed operational information. Delay/on-time definitions remain provisional; label them accordingly.

### 5.2 B2B partner portal

| Screen ID / screen | Content and interactions | Critical variants / requirement coverage |
| --- | --- | --- |
| PAR-01 Login | Admin-issued credentials, company/account identity after login, initial password change where required | Invalid login, expired session; B-01 |
| PAR-02 Overview | Pending orders, ongoing/recent closed trips, published statements; Create Order CTA | No records, refresh failure; B-03/05/06 |
| PAR-03 New order | Pickup/drop, schedule in IST, service/vehicle notes, contact, available duration estimate; review and submit | Inline validation, estimate unavailable, submission pending/retry; B-02/04 |
| PAR-04 Orders & Trips | Current/history, ID, route, schedule, status and date/status filters | Rejected reason, accepted-order trip link, empty filtered result; B-03 |
| PAR-05 Active trip | Route/schedule, driver contact as appropriate, progress, available estimate, updated time; dedicated code reveal | Driver unassigned, estimate unavailable, code masked/revealed, unavailable record; B-03/04 |
| PAR-06 Closed-trip report | Frozen summary, expenses separate from commission, recorded split/shares and closure time | Report fetch failure; B-05 |
| PAR-07 Monthly statements | Published months, trip count, totals and trip-wise detail | No published statements; unpublished records remain unavailable; B-06 |

Company scope comes from the account. Do not add binding partner price entry, approval controls or a payment gateway. Rejection, acceptance and publication emails are separate from the saved UI result; no email notification contains the close code. B-07 maps to notification feedback and delivery behaviour, not an invented push/SMS channel.

### 5.3 Driver Android app

| Screen ID / screen | Content and interactions | Critical variants / requirement coverage |
| --- | --- | --- |
| DRV-01 Authentication/application | Sign in; proposed registration entry; pending/active access state | Invalid login, inactive account, session expiry; D-01 |
| DRV-02 Documents/onboarding | Driving Licence, Aadhaar, PAN, PCC; capture/file choice, progress, completion | Permission denial, invalid file, interrupted upload, retry; D-02 |
| DRV-03 Home/availability | Current trip cards, next action, online toggle, upcoming-date calendar | No assignments, availability Offline vs disconnected network; D-03/04 |
| DRV-04 Trip detail/start | Route, schedule, company/contact, available estimate and Start Trip | Stale assignment, duplicate start, offline start blocked; D-04/05/07 |
| DRV-05 Trip selfie | Capture, preview, retake and upload | Camera denial, compression/upload failure; P1 D-06 |
| DRV-06 Expenses | List; add/edit/delete while ongoing; positive amount, description, optional category/receipt; confirm list | Unsynced draft, invalid amount, No expenses, confirmation cleared; D-08 |
| DRV-07 Close trip | Confirmed expense summary, labelled numeric OTP input and Verify & Close Trip | Wrong code, temporary lockout, lost response, network failure; D-09 |
| DRV-08 Completion | Confirmed Closed status, trip ID, recorded driver share and View Earnings | No local success before confirmation; D-09/12 |
| DRV-09 History | Own completed/credited trips, date filter and detail | Empty history, pagination, fetch failure; P1 D-10 |
| DRV-10 Earnings | Total credited earnings, dated per-trip immutable credits and detail | Refresh/loading/failure; no withdrawals; D-12 |
| DRV-11 Profile/documents | Account details, document status and proposed versioned replacement/edit | Existing document retained, upload failure; P2 D-11 |

D-03 availability interaction is P1, but the P0 admin directory requires its underlying availability display. D-06 selfie is P1; whether it blocks starting remains unresolved. Trip assignment and execution are P0 and must not depend on an invented driver acceptance step.

## 6. Core interaction contracts

### 6.1 Intake, decision and assignment

Partner or admin enters an order → review/submit → show Received only after save → admin accepts with amount or rejects with reason. Acceptance creates one trip; the success view links to it. If another admin decided first, refetch and show the new decision with a clear explanation instead of repeating submission.

An Unassigned trip offers Assign Driver. The chooser shows operationally active drivers with availability; pending drivers cannot be selected. A known schedule conflict is a warning under the current proposal, not an invented capacity rejection. If no driver is available, retain the Unassigned trip for attention.

Reassignment is available before closure, including while Ongoing. Confirmation explains that the previous driver loses operational access and the replacement must review/reconfirm expenses. Preserve existing expenses and original start time. The previous driver's open screen refreshes to an unavailable/reassigned state and removes write controls.

### 6.2 Execution, expenses and closure

The assigned driver starts the trip online → Ongoing → records expenses → confirms the final list → obtains code from partner → enters code → server-confirmed Closed result → earnings/report update.

Any expense add/edit/delete or reassignment clears expense confirmation. Empty lists use the proposed explicit No expenses action. A category is optional and defaults to `other`; do not invent a mandatory category catalogue. Receipt is optional.

Partner trip detail has Reveal Close Code. Keep it masked until requested; hide it again on navigation/session expiry. Explain: “Share this code with your assigned driver after the trip is complete.” Never place it in lists, URLs, notification previews, driver trip payloads or cached screens. The six-digit visual design is a working assumption.

Use a single paste-friendly numeric OTP field, optionally rendered as grouped digits, with a persistent label. Wrong code keeps the trip Ongoing. Temporary lockout shows when retry is available using server-provided policy. There is no admin bypass. A lost response shows checking/retry feedback; display Closed and its persisted credit only after an authorised response confirms them. Do not suggest that a retry produces another credit.

### 6.3 Statements

Admin selects company/completed month → Draft → creator reviews/submits → frozen Pending Verification → creator explicitly approves and one distinct other admin approves, in either order → Verified → admin publishes → partner sees Published statement.

Detail must show creator identity and two named approval positions. Creation is not approval. Two noncreator approvals cannot replace the creator. Disable Publish until the valid pair exists and explain which approval is missing. Submitted content is immutable; only the creator regenerates an unsubmitted draft. An occupied second-admin position or changed content version causes a refresh/explanation rather than an extra approval.

Publication and email delivery are separate. Show Published after the committed result even when its email is pending/failed. Where delivery status is displayed, Sent means provider acceptance, not proof of reading. Ordinary reports need no statement approval workflow.

## 7. Forms, amounts and content rules

| Input/content | UI contract |
| --- | --- |
| Order fields | Required route, scheduled date/time, contact and applicable service/vehicle notes; preserve valid input on recoverable failure |
| Schedule | Display timezone at entry; use `6 Oct 2026, 10:30 AM IST`; do not silently convert it into an unlabeled local time |
| Trip amount | INR, nonnegative under the working design; field-level error for invalid precision/format; editable before closure only |
| Company split | Each percentage within 0–100 and combined total 100; show computed preview and field errors; no per-driver split setting |
| Expense | Positive INR amount and nonempty description; zero represented by No expenses confirmation |
| Estimate | Prefer Estimated duration where data is a duration; label an arrival time only when one exists. Unknown is Estimate unavailable, never zero minutes |
| Amount formatting | Indian digit grouping and explicit ₹/INR; two decimal places where exact amounts matter |
| Rate changes | Explain that future closures use the applicable rate and closed financial records remain unchanged |
| Rejection | Required reason visible in order detail; confirmation reports saved rejection and email intent, not guaranteed delivery |
| Record unavailable | Generic “This record is unavailable.” Avoid disclosing another company/driver's record existence |
| Documents | Private authorised viewer; labelled upload state; use synthetic/masked examples in design files |

Before closure, label projected shares Estimated. After closure, use recorded values, rate and closure time. For ₹10,000 at driver/company 30/70, show ₹3,000 driver share and ₹7,000 company share. Show ₹150 expenses separately; under the working rule they do not increase commission or wallet credit. Do not assign legal recipient or tax meaning to company share beyond the documented label.

The current wallet has no debit/cash-out workflow. Proposed copy is Total credited earnings with “Payments are handled offline.” It must not imply cash available to withdraw. Any audited external Paid/Unpaid metadata is distinct from immutable earnings and statement lifecycle; changing it cannot alter the recorded credit.

## 8. Loading, failures and mobile connectivity

| State | Required behaviour |
| --- | --- |
| Initial loading | Layout-matched skeleton; do not flash zero financial totals |
| Empty data | Explain the state and show a relevant authorised next action |
| Empty filter result | Keep active filters visible; offer Clear filters |
| Validation | Error next to field plus form summary where useful; focus first invalid field |
| Mutation pending | Disable duplicate action, keep progress visible, preserve input |
| Successful save | Confirm saved state, refresh affected lists/detail and show next action |
| Retryable network error | Explain the failure and offer retry without duplicating the operation |
| Concurrent/stale update | Refetch authoritative state and explain why the original action is unavailable |
| Expired session | Reauthenticate; remove exposed code/private file content; never cache credentials |
| Stale cached mobile data | Mark read-only content and show last-updated time |
| Network disconnected | Explain which actions require connection; distinguish connectivity from driver availability |
| Interrupted upload | Preserve safe form input, show failed upload state and retry; never imply unfinished upload is attached |
| Camera denied | Explain access need and provide supported file/retry path without falsely showing completion |

Cache only minimal authorised trip data for reading. Do not persist OTPs, document images or credentials in ordinary client storage. Local expense drafts must be marked Unsynced; they do not satisfy expense confirmation. Start, expense confirmation and closure require connectivity. Revalidate assignment before retrying a queued write; discard an unauthorised action with an explanation after reassignment.

Refresh active information on foreground entry and at the agreed polling interval, displaying the fetched timestamp. Update driver, admin and partner views after successful mutations. Avoid suggesting instantaneous push delivery when the current design uses refresh/polling.

## 9. Accessibility requirements

- Use persistent field labels, appropriate input types, meaningful button names and helpful error descriptions.
- Support keyboard navigation and visible focus. Dialogs move focus inside, keep it there while open and restore it to the trigger after close.
- Validate text contrast at least 4.5:1 for normal text and 3:1 for large text; important control boundaries/focus indicators should reach 3:1 against adjacent colours.
- Include text alongside status colour. Charts have labels or a table/text equivalent.
- Keep touch targets at least 48×48 px on mobile, support enlarged text and avoid keyboard-obscured actions.
- Announce important validation/save results accessibly; do not rely on a disappearing toast alone.
- Keep financial lines, button labels and order/trip IDs readable at narrow widths. Use reduced-motion behaviour for nonessential transitions.

These are acceptance targets; the inspected palette and future screens have not yet passed an accessibility audit.

## 10. Reusable components and design handoff

Deliver named design groups for Design System, Admin Portal, Partner Portal and Driver App. Use screen IDs from Section 5 as frame prefixes. Share components rather than independently restyling each surface.

The component library includes primary/secondary/destructive buttons and states; labelled fields and errors; money/percentage inputs; search and filters; tabs; status badges; KPI cards; tables/pagination; responsive record cards; dialogs/drawers; lifecycle timelines; driver chooser; availability calendar; document/receipt upload; private viewer; OTP input; approval slots; empty/error panels; notification feedback and mobile bottom navigation.

Document desktop/mobile variants, component state, spacing/type/colour tokens and interactions. Preserve the exact semantic colour sources in Section 2. Mark generated/mock data and product assumptions. Do not put engineering discussion or requirement IDs into end-user screens.

Establish six representative frames first: ADM-02 Overview, ADM-04 Order Detail, ADM-06 Trip Detail, ADM-12 Statement Detail, PAR-05 Active Trip and DRV-06/07 Expenses/Closure. Then extend the shared system to every listed screen. A Stitch output is a design draft until reviewed; it does not establish new product policy or passed functionality.

Connect these prototype journeys where supported:

1. Partner submits order → admin accepts → assigns driver → driver views/starts trip.
2. Driver logs/confirms expenses → partner reveals code → driver closes → earnings and partner report show recorded results.
3. Admin generates/submits statement → creator plus second-admin approvals → publish → partner views.
4. Rejected order, invalid OTP, interrupted upload, disconnected driver, concurrent order decision and ongoing reassignment variants.

## 11. Open product decisions

Retain these assumptions until a named owner records an answer in the existing [PRD validation register](database/prd-validation.md). A design frame must not be treated as approval of an unresolved policy.

| Decision | Working presentation / consequence |
| --- | --- |
| OTP length, expiry, replacement and lockout | Six-digit example; error/lockout variants; actual limits come from agreed policy |
| Zero-expense trip | Explicit No expenses confirmation |
| Expense reimbursement | Expenses separate from commission; no extra wallet credit or reimbursement action |
| Document-completeness gate | Four current uploads before operational activation proposed; no formal verification claim |
| Selfie before start | Optional P1 capture until mandatory-start policy is confirmed |
| Ongoing reassignment payout | Closing driver receives whole share under current proposal; no invented contribution splitting |
| Statement visibility/month rules | Published-only access; actual closure month in Asia/Kolkata; completed-month generation |
| Statement revision/creator unavailability | No post-submission revision or substituted creator approval flow |
| Wallet semantics/offline cash-out | Total credited earnings; no debit/withdrawal workflow |
| Delay/success metrics | Provisional labels until thresholds and date basis are agreed |
| No driver / schedule overlap | Keep Unassigned; known conflict warning without invented allocation policy |

## 12. Review and acceptance evidence

Before implementation handoff, record design links/version, named design/review owners, review date and unresolved decisions. Before release, attach actual validation evidence; the checks below are planned, not passed results.

| Check | Expected evidence |
| --- | --- |
| Visual consistency | Reference comparison for palette, type, navigation, cards and tables |
| Screen coverage | All Section 5 screen IDs and relevant PRD IDs mapped to frames |
| Lifecycle correctness | Each prototype path respects Section 4 action gates |
| Role isolation | Partner company scope and driver ownership apply to navigation, detail, totals, uploads and exports |
| Financial clarity | Estimated vs frozen amounts, separate expenses, credited-earnings wording and no duplicate-credit implication |
| Approval gate | Creator approval plus distinct second admin; missing/stale approvals cannot enable Publish |
| Failure resilience | Loading/empty/validation/network/conflict/upload/session states and input preservation |
| Android behaviour | Keyboard, permissions, background/resume, network interruption and reassignment demonstrated |
| Accessibility/responsiveness | Keyboard/focus/contrast/text-size checks and desktop/tablet/narrow frame evidence |
| Team handoff | Full-stack and Flutter review; penetration-tester review of sensitive access/code/document interactions |

Record material changes to this specification with related implementation changes. Do not claim usability, accessibility or security completion from a static prototype alone.
