# Project change list

Add new requests as numbered checklist items. Mark an item done only after its implementation and relevant verification are complete. Keep completed items here for reference.

1. [x] **CHG-001 — Business client session timeout: 24 hours.** Keep business partners signed in for 24 hours from sign-in, with automatic access-token renewal during that window, including returning to a backgrounded tab.
2. [ ] _Next change — add details here._

CHG-001 completed on 22 October 2026. Verified with 212 backend checks, 45 business-portal unit checks, 40 desktop/mobile fixture browser checks and 6 real portal journeys. Builds, typecheck, lint and blank/populated/repeated migrations pass. Existing partner sessions are capped at 24 hours from creation; refreshing does not extend the deadline.
