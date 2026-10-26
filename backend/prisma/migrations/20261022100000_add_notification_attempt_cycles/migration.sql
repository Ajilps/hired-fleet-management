-- Keep total attempt history when an admin opens a new bounded retry cycle.
ALTER TABLE notifications DROP CONSTRAINT ck_notifications_state;
ALTER TABLE notifications ADD COLUMN attempt_cycle_start INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD CONSTRAINT ck_notifications_state CHECK (
 status IN ('pending','processing','sent','failed') AND attempt_count >= 0 AND
 attempt_cycle_start >= 0 AND attempt_count - attempt_cycle_start BETWEEN 0 AND 5 AND
 (recipient_email IS NOT NULL OR (status = 'failed' AND failure_reason = 'RECIPIENT_MISSING')));
