# Operations and recovery runbook

**Status:** proposed procedures, reviewed 10 October 2026. Runtime services, monitoring and backup jobs are not installed yet. Fill in the deployment-specific details before shared staging or production use.

Use this guide for service failures and recovery. Use [deployment](deployment-guide.md) for planned releases and [security design](security-design.md) for access and sensitive data.

## 1. Operational ownership

Record named people and secure links under DEC-25 in the [decision log](decision-log.md). The repository admin may also hold an operational responsibility; these are not new application roles.

| Responsibility | Record before use |
| --- | --- |
| Incident lead | Primary person, backup and escalation channel |
| Release owner | Deployment authority and release record location |
| Database/backup owner | Backup dashboard, restore procedure and recovery authority |
| Provider owner | Storage/scanner and email support; maps access only when later integrated |
| Managed PostgreSQL / Redis owner | Provider dashboards, TLS/pool settings, Redis roles/limits, alerts and recovery access |
| Security contact | Penetration tester and private finding/incident channel |

Also record environment identifiers, service dashboards, secret-manager references and current versions. Do not put passwords, access tokens, close codes or private document links in this file or an issue.

## 2. Routine checks

Implement monitoring for these signals and choose thresholds under DEC-23. A healthy process alone does not prove correct business behavior.

| Signal | What to investigate |
| --- | --- |
| API failures/latency and database connection pressure | Affected operations, release timing and dependency availability |
| Container health/restarts and shutdown timeouts | Resource pressure, startup readiness and interrupted work |
| Managed PostgreSQL capacity/availability | Prisma/driver pool acquisition waits/exhaustion across API and workers, lock waits, storage, provider incidents and selected-plan limits |
| Redis latency/memory/evictions and cache misses | Cache fallback load, invalidation failures and impact on any critical role |
| Failed/stale email jobs and lease age | Provider response, retry schedule and worker health |
| Uploads stuck pending or rejected unexpectedly | Scanner availability, content validation and private storage permissions |
| Closure/report/payroll/credit mismatches | Partial-write bug, duplicate processing or invalid data |
| Wallet balance versus credit ledger | Reconciliation failures; no manual balance edits |
| Statement approvals/publication failures | Creator/version/state and recorded explicit approvals |
| Repeated denied access/OTP attempts | Abuse, expired session or client workflow error; avoid sensitive logging |
| Backup age and restore-test results | Whether agreed recovery targets can still be met |
| Heuristic policy/configuration errors and unavailable estimates | Missing/invalid speed or distance; do not invent a duration or treat a heuristic as traffic-aware |

Reconciliation checks should run read-only and report mismatches by safe record IDs. Define query/scripts and scheduling with the implementation; none are supplied here as runnable production commands.

## 3. First response to an incident

1. Record environment, UTC time, observed impact and safe request/record IDs.
2. Identify the affected workflow and recent deployment/configuration changes.
3. Check database and provider health, then inspect sanitized logs and durable state.
4. Contain the affected action if continuing could expose data or create incorrect financial records. Preserve unaffected service where possible.
5. Choose a reviewed recovery or compatible rollback. Record the operator and actions taken.
6. Verify the user-visible outcome and financial/access invariants before restoring normal operation.
7. Record cause, recovery evidence and a follow-up task/test that prevents recurrence.

Keep security findings and personal data in the agreed private channel. Share a short impact update through the incident lead; do not paste production payloads into public issues.

## 4. Common incidents

### A user lost the close-trip response

Check the persisted trip, payroll, report and credit through authorized application tooling. The client retries with the original command identity. An authorized recorded payroll driver must receive the committed result without another credit.

If no transaction committed, the normal state/version/code checks apply to a new attempt. Do not manually close the trip, insert a credit or ask the partner to expose the code in logs. See QA-11/12/15 in [testing](testing-strategy.md).

### A financial mismatch or duplicate is reported

Pause affected financial writes if the fault could continue. Preserve command records, transaction/audit IDs and immutable snapshots. Compare trip, assignment, payroll, wallet ledger/balance and report.

Escalate to the backend owner and incident lead. Phase 1 has no approved reversal/manual-adjustment workflow. Do not delete a duplicate-looking credit or directly edit a balance. Agree a reviewed correction and reconciliation plan, including an audit trail, before changing financial data.

### Email delivery fails

Confirm that the business action and notification intent committed. Inspect sanitized provider status, attempt count, retry timing and the worker's current lease. Restart/recover the worker only using the implemented claim protocol.

Retry the existing delivery job under the agreed DEC-20 policy. Do not repeat order acceptance or statement publication to send another email. Provider acceptance means accepted for delivery, not proof of inbox receipt; duplicate delivery remains possible without provider idempotency.

### Upload scanning is delayed or fails

Keep pending/rejected assets private and unusable. Check scanner/storage health and job state. Retain the previously attached clean document during a failed replacement.

Retry scan processing through the implemented job procedure. Never bypass the clean-file requirement or make a bucket public to diagnose downloads. Check authorization and the asset's recorded owner/purpose/context when investigating a denied attachment.

### Assignment, expense or statement action is blocked

Refresh the authoritative state/version. Confirm the active/current driver, trip state or statement creator/approvals. Reassignment revokes the previous driver's execution access and invalidates expense confirmation.

An unassigned accepted trip needs an admin assignment; it is not an email-worker recovery job. A submitted statement has no approved edit/void bypass. Escalate unresolved cases under DEC-18 instead of directly changing database state.

### A credential or private file may be exposed

Restrict the affected access and involve the security contact. Revoke affected sessions/credentials or links through the agreed mechanisms. Preserve sanitized evidence and determine who/what was accessible.

Rotate compromised keys using the reviewed key-recovery procedure; preserve access to legitimate encrypted records through managed key versions. File deletion and key destruction can also break recovery, so coordinate containment with the backup owner.

### Redis is unavailable or under memory pressure

Identify its actual role first: disposable cache, authoritative sessions, abuse controls or optional queue. See [infrastructure plan](infrastructure-plan.md#5-sessions-throttling-and-queues). Cache-only failure uses bounded PostgreSQL fallback and alerts; watch database connection/CPU pressure before increasing traffic or restarting many instances.

Critical session/limiter failure follows its reviewed secure fallback or refuses affected operations. Do not bypass checks, restore revoked sessions, clear lockouts or flush unrelated Redis state to repair a cache. If a queue is adopted, reconcile pending email intents from PostgreSQL through the agreed dispatcher/claim protocol before resuming sends.

Check memory limits, eviction policy, client timeouts, persistence/failover status and recent configuration changes. Separate instances with different state guarantees; changing logical database numbers does not isolate memory policies. A cache rebuild must not create credits or replay business mutations.

### Managed PostgreSQL or a container fails

Check provider status, verified TLS/credentials, pool saturation and recent migrations/releases. Bound reconnect attempts and preserve uncertain command identities. A connection loss during commit requires reading/replaying the saved result, not assuming the transaction failed.

Check container logs/health and host capacity before restarting. Graceful shutdown should stop new API work/worker claims and let in-flight transactions settle. Recover expired email claims through the existing lease. Restart only with the recorded compatible image/configuration; do not make manual container changes the new deployment definition.

### A Prisma migration or generated build fails

Stop the release and preserve the failed job status, release/model/migration revisions and sanitized logs. Verify actual PostgreSQL schema/data and custom constraints against the committed history before retrying. Check pinned CLI/runtime/driver compatibility, generated artifacts and migration connection permissions/pool mode. Use the reviewed recovery path in [deployment](deployment-guide.md#4-database-and-client-compatibility); do not reset production, erase applied history or mark an unverified migration complete. Revalidate a repair in isolation and keep workers/API on a schema-compatible release.

### A rough travel-time estimate is missing or disputed

Check supplied road kilometres, stored source/speed/policy and any admin override. The initial design has no maps dependency; missing distance/policy means unavailable, not a provider outage. An admin may correct the duration through the override before closure. Do not backfill guessed distances, silently recalculate accepted/frozen estimates or alter financial results. Follow [estimation](travel-time-estimation.md) and the agreed DEC-32 policy.

## 5. Backups and restore

Choose recovery point objective (maximum acceptable data loss) and recovery time objective (maximum acceptable recovery time) under DEC-22. Set backup frequency, retention, encryption, custody, restore-test frequency and alert thresholds to meet those agreed targets. No numerical target is approved yet.

PostgreSQL supports logical dumps, file-system backups and continuous archiving. Choose the appropriate approach and validate restoration for the selected PostgreSQL version; see the [PostgreSQL 16 backup documentation](https://www.postgresql.org/docs/16/backup.html).

Recovery must cover more than table rows:

- Database records, durable command/replay records, migrations and necessary recovery logs.
- Private file objects and their ownership/scan/context records, at a compatible recovery point.
- Required encryption key versions and secret-manager recovery access, stored separately and securely.
- Deployed artifact/configuration references and the restore procedure itself.

For managed PostgreSQL, verify the chosen plan's retention, recovery granularity, restore destination/downtime, access and export options. Record provider and operator responsibilities. Provider-managed backups still need a demonstrated restore; do not assume a free/test plan meets production targets.

Redis cache is rebuildable and is not a business backup. If Redis later owns sessions, limiters or jobs, add its explicit recovery policy and persistence/failover exercise under DEC-30. After restore, preserve revocations/abuse limits and reconcile queued work with PostgreSQL; do not replay old emails merely because a queue backup contains them.

Backing up the database alone does not restore deleted private files or lost decryption keys. Document cross-system consistency and reconciliation when storage/database recovery points differ.

### Restore exercise

1. Select a backup/recovery point and record its age, coverage and operator.
2. Restore into an isolated environment with production outbound email and other side effects disabled. Use separate service credentials and restrict access to restored personal data.
3. Restore the matching private assets and required key versions through controlled access.
4. Verify schema/version compatibility, Prisma model/migration history and custom constraints/indexes/triggers, plus record counts. Reconcile closed trips, payroll, credits, balances, report snapshots and statement approvals/items.
5. Test authorized private-file access and denial across companies/drivers. Verify required encrypted records can still be read by the intended application path.
6. Exercise a committed-command replay and confirm no new financial result is created. Validate recovery for pending scans and notification intents without sending real email.
7. Measure recovery time and potential data loss against the agreed targets. Record evidence and fix failures.
8. Remove the isolated restored data according to the retention policy when the exercise is complete.

For a real incident, the incident lead and backup owner first agree a recovery point, write freeze, reconciliation plan and cutover. Do not overwrite production with an unverified restore. Account for valid writes after the chosen backup and uncertain provider deliveries before resuming workers.

## 6. Incident record

```text
Environment / incident ID:
Impact and affected workflow:
Start / detection / containment / recovery times (UTC):
Release and safe record/request IDs:
Lead and operators:
Cause and evidence location:
Actions, rollback or recovery point:
Data loss / reconciliation / provider side effects:
Verification and user impact remaining:
Follow-up task, owner and prevention test:
```

QA-24/27/29/30/31 cover recovery, container, migration and dependency-failure evidence. A scheduled backup that has never been restored is not sufficient release evidence.
