BEGIN;
CREATE INDEX ix_users_created_at_id ON users (created_at, id);
COMMIT;
