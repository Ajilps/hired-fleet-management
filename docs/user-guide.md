# HireD user guide

**Status:** draft guide for the proposed Phase 1 application, reviewed 10 October 2026. The application is not built yet. Screen labels may change when the UI branch is integrated.

This guide explains what each user does. For exact screen/API mappings and delivery priorities, see [requirements traceability](requirements-traceability.md). Rules marked **proposed** still need a team decision.

## 1. Choose the right account

| User | Main tasks |
| --- | --- |
| Admin | Manage companies/drivers, review orders, assign trips, review statements and reporting |
| Business partner | Place and follow own-company orders, share close codes, read reports/statements |
| Driver | Upload documents, execute assigned trips, record expenses and view earnings |

Sign in with your own account. Partners see their own company. Drivers see their own permitted assignments/history. Admins have the same application role, but statement approval still needs two distinct people.

Use the account-entry method agreed by the team. Public driver registration remains unresolved. Provisioned partners must change their initial password before company access and sign in again; the API supports this flow, while its partner portal screen remains pending. There is no shared default password. An inactive user account cannot sign in or keep using an old session.

## 2. Admin: prepare for work

1. Create the company and its partner account through the admin portal.
2. Set the company's effective driver/company split before assigning paid work. Historical rate records must remain available.
3. Review a pending driver's onboarding uploads and set operational status when the agreed requirements are met.
4. Check driver availability separately from activation. An online toggle does not activate a pending driver.
5. Make sure at least two distinct admin accounts are available for statement approval.

The four onboarding document types are driving licence, Aadhaar, PAN and PCC. Requiring all four current clean files before activation is **proposed**. Activation enables work; it does not certify formal document verification.

### Review and assign an order

1. Open the order and check company, route, schedule, contacts and notes.
2. Accept with the agreed amount, or reject with a reason. The decision creates an email intent; delivery can take longer.
3. An accepted order creates one unassigned trip. Select an eligible active driver to assign it.
4. Follow trip state and saved expenses in trip detail.

Admins may enter phone/WhatsApp orders for a company. The source is recorded with the order.

Reassignment is limited to before closure in the working design. It removes the old driver's execution access, retains the original start/expenses and requires the new driver to review and confirm expenses again. Paying the entire driver share to the closing driver is **proposed**; do not promise contribution splitting.

## 3. Business partner: place and follow an order

1. Enter pickup/destination, schedule, contact details and any instructions. If known, optionally supply road kilometres for a rough time estimate; do not substitute straight-line distance.
2. Submit and wait for the admin's decision. Submission does not mean accepted or assigned.
3. Open the accepted trip to follow assignment and execution state.
4. At completion, use the authorized close-code reveal action and share the code with the assigned driver when appropriate.
5. After successful closure, open the frozen trip report. Read monthly statements when published under the working visibility policy.

Keep the close code private. It is not included in ordinary trip details, reports or notification emails. Drivers enter it; admins do not reveal it through their normal role.

The initial time estimate uses supplied road kilometres and an average-speed assumption. It is labelled **Rough estimate — based on supplied road distance, without traffic**. It is not a guaranteed arrival time or live GPS tracking. Admins can override the minutes; missing distance or a usable estimate shows **Estimate unavailable**. You can still place the order.

Google Maps and other routing services are not connected in the initial plan. Maps-based estimation remains later P1 work. See [travel-time estimation](travel-time-estimation.md) for the design.

## 4. Driver: onboarding and trip execution

### Before your first trip

Upload your own required documents. Wait for upload scanning to finish and for admin activation under the agreed policy. A file that is still pending or rejected cannot be attached as a usable document.

Pending drivers can access their own onboarding profile/documents. Pending, inactive or suspended driver profiles cannot execute trips or change availability. An active user may still read their own previously credited history/earnings.

### Complete an assigned trip

1. Open your assignment and check route, schedule and contacts. There is no driver accept/reject step.
2. Start the trip while connected. Wait for the server to confirm the start.
3. During the ongoing trip, add expenses with a positive amount and a description. A receipt and category are optional; omitted category uses `other`.
4. Review the complete saved expense list and confirm it. If there are no expenses, explicitly confirm the empty list under the proposed rule.
5. Ask the business partner for the close code and enter it in the close-trip screen.
6. Wait for server-confirmed closure. Check the completed report and recorded earnings.

Only the original expense submitter who is still the current driver may edit/delete their entries before closure. After reassignment, the new driver can review retained entries and must reconfirm the combined list. Any expense change clears the previous confirmation.

Availability/calendar, selfie capture and the completed-history screen are P1. Profile editing/document replacement are P2. A mandatory selfie-before-start gate has not been agreed; the current API draft does not require it.

### Earnings

Closure records one driver credit using the rate effective at server closure time in the working design. For a ₹10,000 trip at 30% driver / 70% company, the recorded shares are ₹3,000 and ₹7,000. A separate ₹150 expense does not change these shares under the proposed expense rule.

The earnings view records credits. Phase 1 has no in-app withdrawal, payment gateway or manual wallet-credit workflow. Do not treat the displayed balance as a promise of immediate cash settlement.

## 5. Admin: monthly statements

The working policy uses one statement per company/calendar month and generates completed months using actual closure dates in Asia/Kolkata. This policy still needs confirmation.

1. Generate a draft and check the copied trip amounts/rates. Only its creator can regenerate the draft, which advances its content version.
2. Submit the reviewed version. Submission freezes content; it is not approval.
3. The creator and exactly one other admin explicitly approve that same version. They can approve in either order.
4. Once verified, an admin publishes it. Publication makes it available to the partner under the proposed published-only policy and creates an email intent.

The same person twice, two noncreator admins, or approvals for an older version cannot satisfy verification. Submitted revision, void, disputes and creator-unavailability overrides are not defined. Escalate such cases rather than editing frozen records.

## 6. When something goes wrong

| Situation | What to do |
| --- | --- |
| Upload pending/rejected | Wait for scanning or correct the file; keep the previous clean document during replacement |
| Start/confirm/close while offline | Reconnect and refresh; a local draft is not a saved expense or a completed trip |
| Close response lost | Keep the original retry identity and let the app check/retry; do not submit a separate payout request |
| Wrong/expired code or retry delay | Follow the server message/timer and contact the partner/support through the agreed process |
| Expense confirmation cleared | Refresh, review all saved entries and confirm again |
| Assignment disappeared | Refresh and contact dispatch; do not keep executing queued writes after reassignment |
| Statement missing | Check company/month and publication state with an admin |
| Email missing | Check the actual order/statement status; email failure does not undo the action |

For support, provide the order/trip/statement ID, approximate time and visible error. Do not send passwords, close codes or identity-document images in a public channel. The support contact will be named before pilot use under DEC-25.
