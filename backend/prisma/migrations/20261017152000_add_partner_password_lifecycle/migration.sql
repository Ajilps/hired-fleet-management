BEGIN;
ALTER TABLE users ADD COLUMN password_change_required boolean NOT NULL DEFAULT false;
CREATE INDEX ix_company_users_company_id_created_at_user_id ON company_users (company_id, created_at, user_id);
COMMIT;
