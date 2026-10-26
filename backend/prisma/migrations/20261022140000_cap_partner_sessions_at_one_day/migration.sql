-- Apply the owner-selected 24-hour absolute lifetime to existing partner sessions.
-- Preserve shorter expiries and leave admin/driver sessions unchanged.
UPDATE auth_sessions AS session
SET expires_at = LEAST(session.expires_at, session.created_at + interval '24 hours')
FROM users AS account
WHERE session.user_id = account.id AND account.role = 'partner'
AND session.expires_at > session.created_at + interval '24 hours';
