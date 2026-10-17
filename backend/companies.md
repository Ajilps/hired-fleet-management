# Companies and payout rates

Implementation baseline for C05–C06 and the admin portions of C08/C09, 17 October 2026. Command foundation PR #12 merged at `74b7428`. This slice implements admin company list/create/detail/update and payout-rate list/create. Partner provisioning/authentication and own-company reads remain C07 and the remaining C08/C09 work; no partner scope or empty partner list is fabricated.

## Policy and contracts

Company creation commits its profile, initial exact payout split, audit events and durable command result in one transaction. PATCH and rate creation also use the command coordinator. Every write requires the declared Idempotency-Key and current admin authentication, including replay. Profiles have no If-Match requirement in the current API: writes serialize under the company lock and the last successful update wins. Names are not business-unique in the contract; retry identity prevents duplicate intent execution, while a new key is a new intent.

Rate inputs are exact two-decimal strings, both positive and summing to 100.00; validation uses integer hundredths, never floating-point percentage arithmetic. PostgreSQL numeric(5,2), CHECKs, one open interval per company and a GiST exclusion constraint protect stored splits and half-open `[effectiveFrom,effectiveTo)` history. `btree_gist` is required in each database and installed by the migration; managed deployment must permit this trusted extension.

Each rate change locks the company first, closes the current interval and begins the next at the same database-chosen instant. The effective instant is chosen after obtaining the lock, becomes visible on commit and cannot be supplied by a client. Timestamps use millisecond precision consistently with API timestamps/cursors. If the database clock has not advanced beyond the previous start, the change refuses with retry guidance instead of creating an empty interval or silently scheduling a future rate. Closed intervals/percentages cannot be rewritten or deleted; closing an open interval once is the only update allowed. This establishes the ordering rule future trip closure must share; no payroll/closure integration is claimed yet.

Deactivation updates the company flag and audit only. Historical profile/rate reads remain available and no sessions/history are deleted. Future intake must check this flag while holding the company lock; intake does not exist in this increment. Existing execution and frozen financial history remain later milestones. Rate maintenance remains available to admins for inactive companies.

Membership storage follows the one-company-per-partner design, with FKs, user uniqueness and role guards. Admin account list/provisioning and own-company partner profile reads are now implemented in the next [partner slice](partners.md); rate maintenance and company administration remain admin-only.

## Pagination and secrets

Company and rate lists use newest-created timestamp/UUID order and repeatable-read snapshots for page rows and whole-scope totals. Signed opaque cursors bind actor, collection/company and ordering; changing scope, tampering or malformed cursors is rejected. Search/status in the existing directory remain explicitly current-page filters; no undocumented server filters are introduced.

The first command consumer now requires `COMMAND_FINGERPRINT_KEY`, a unique random 32-byte base64url key distinct from AUTH_SESSION_KEY. It also signs company cursors using a separate purpose prefix. Generate each secret independently using the command in `.env.example`, configure ignored local/deployment secrets and keep the command key stable for replay retention. No key value is logged. Startup rejects missing/invalid configuration.

Existing admin list/create/detail and payout display use the real endpoints with no transport changes. The account list/provisioning now uses the real partner endpoints, with an unavailable fallback if an older backend returns 404. Live desktop/mobile tests exercise provisioning and first-login enforcement; Orders remains unavailable. Rate creation/profile update are API capabilities; their admin editing controls are outside the current frontend scope.

## Validation and rollout

Apply all migrations before starting this build; readiness additionally requires companies, memberships and rates. Tests use disposable synthetic PostgreSQL data and cover replay, rollback, authorization, cursor scope/ties/totals, exact decimals, adjacent intervals, direct invalid/overlapping writes, rate races and preserved prior auth/audit/replay data. Live browser evidence is separate from intercepted frontend regressions.

Rollback the API/client deployment together if necessary, retaining additive tables and audit/replay history. Never drop rate history or disable its protection as a routine rollback. Independent implementation/security/shared-contract review and managed-service validation remain separate gates.

Sources: PostgreSQL 18 [range exclusion constraints](https://www.postgresql.org/docs/18/rangetypes.html#RANGETYPES-CONSTRAINT) and [btree_gist](https://www.postgresql.org/docs/18/btree-gist.html); supported [Prisma 7 custom migrations](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/customizing-migrations). No new application library or Redis role is introduced.
