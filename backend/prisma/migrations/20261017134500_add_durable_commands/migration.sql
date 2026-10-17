BEGIN;

CREATE TABLE "command_replays" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "request_method" VARCHAR(6) NOT NULL,
    "canonical_path" VARCHAR(512) NOT NULL,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "request_fingerprint" VARCHAR(64) NOT NULL,
    "outcome" VARCHAR(10) NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_body" JSONB NOT NULL,
    "response_headers" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pk_command_replays" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "request_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pk_audit_logs" PRIMARY KEY ("id")
);

CREATE INDEX "ix_command_replays_expires_at" ON "command_replays"("expires_at");

CREATE UNIQUE INDEX "uq_command_replays_scope" ON "command_replays"("actor_user_id", "request_method", "canonical_path", "idempotency_key");

CREATE INDEX "ix_audit_logs_entity_type_entity_id_created_at" ON "audit_logs"("entity_type", "entity_id", "created_at");

CREATE INDEX "ix_audit_logs_actor_user_id_created_at" ON "audit_logs"("actor_user_id", "created_at");

ALTER TABLE "command_replays" ADD CONSTRAINT "fk_command_replays_actor_user_id" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "fk_audit_logs_actor_user_id" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE command_replays
  ADD CONSTRAINT ck_command_replays_method CHECK (request_method IN ('POST', 'PATCH', 'DELETE')),
  ADD CONSTRAINT ck_command_replays_path CHECK (canonical_path ~ '^/api/v1/[a-z0-9]+([-/][a-z0-9]+)*$'),
  ADD CONSTRAINT ck_command_replays_key CHECK (idempotency_key ~ '^[A-Za-z0-9:_-]{1,100}$'),
  ADD CONSTRAINT ck_command_replays_fingerprint CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_command_replays_outcome CHECK ((outcome = 'succeeded' AND response_status BETWEEN 200 AND 299) OR (outcome = 'rejected' AND response_status BETWEEN 400 AND 499)),
  ADD CONSTRAINT ck_command_replays_expiry CHECK (expires_at > created_at),
  ADD CONSTRAINT ck_command_replays_body_size CHECK (octet_length(response_body::text) <= 65536),
  ADD CONSTRAINT ck_command_replays_empty_response CHECK (response_status <> 204 OR response_body = 'null'::jsonb),
  ADD CONSTRAINT ck_command_replays_headers CHECK (jsonb_typeof(response_headers) = 'object' AND response_headers - ARRAY['ETag', 'Location']::text[] = '{}'::jsonb);

ALTER TABLE audit_logs
  ADD CONSTRAINT ck_audit_logs_before CHECK (before_data IS NULL OR (jsonb_typeof(before_data) = 'object' AND octet_length(before_data::text) <= 65536)),
  ADD CONSTRAINT ck_audit_logs_after CHECK (after_data IS NULL OR (jsonb_typeof(after_data) = 'object' AND octet_length(after_data::text) <= 65536));

CREATE FUNCTION reject_audit_log_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are append-only.' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER trg_audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_audit_log_change();
CREATE TRIGGER trg_audit_logs_no_truncate
BEFORE TRUNCATE ON audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_log_change();
COMMIT;
