-- AlterTable
BEGIN;

-- Account identifiers are case-insensitive; duplicate legacy identities fail the
-- existing unique index and require explicit reconciliation before deployment.
UPDATE users SET email = lower(email);
ALTER TABLE users ADD CONSTRAINT ck_users_email_normalized CHECK (email = lower(email));

ALTER TABLE "auth_sessions" ADD COLUMN     "transport" VARCHAR(10) NOT NULL DEFAULT 'token';
ALTER TABLE auth_sessions ADD CONSTRAINT ck_auth_sessions_transport CHECK (transport IN ('browser', 'token'));

-- CreateTable
CREATE TABLE "auth_refresh_tokens" (
    "token_hash" VARCHAR(64) NOT NULL,
    "session_id" UUID NOT NULL,
    "consumed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pk_auth_refresh_tokens" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "auth_rate_limits" (
    "key_hash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL,
    "window_ends_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pk_auth_rate_limits" PRIMARY KEY ("key_hash")
);

-- CreateIndex
CREATE INDEX "ix_auth_refresh_tokens_session_id" ON "auth_refresh_tokens"("session_id");

-- CreateIndex
CREATE INDEX "ix_auth_rate_limits_window_ends_at" ON "auth_rate_limits"("window_ends_at");

-- AddForeignKey
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "fk_auth_refresh_tokens_session_id" FOREIGN KEY ("session_id") REFERENCES "auth_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE auth_rate_limits ADD CONSTRAINT ck_auth_rate_limits_attempts_positive CHECK (attempts > 0);
COMMIT;
