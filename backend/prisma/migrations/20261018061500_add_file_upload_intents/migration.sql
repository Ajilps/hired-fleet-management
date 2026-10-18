BEGIN;

-- Owner selected PDF/JPEG/PNG up to 5 MiB on 18 October 2026.
ALTER TABLE file_assets ADD CONSTRAINT ck_file_assets_upload_size CHECK (byte_size <= 5242880);
ALTER TABLE file_assets ADD CONSTRAINT ck_file_assets_upload_type CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png'));
CREATE TABLE file_upload_intents (
  asset_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  idempotency_key varchar(100) NOT NULL,
  request_fingerprint char(64) NOT NULL,
  lease_token uuid,
  lease_expires_at timestamptz(6),
  completed_at timestamptz(6),
  created_at timestamptz(6) NOT NULL,
  CONSTRAINT pk_file_upload_intents PRIMARY KEY (asset_id),
  CONSTRAINT fk_file_upload_intents_asset_id FOREIGN KEY (asset_id) REFERENCES file_assets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_file_upload_intents_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_file_upload_intents_key CHECK (idempotency_key ~ '^[A-Za-z0-9:_-]{1,100}$'),
  CONSTRAINT ck_file_upload_intents_fingerprint CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_file_upload_intents_lease CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL) AND (completed_at IS NULL OR lease_token IS NULL))
);
CREATE UNIQUE INDEX uq_file_upload_intents_actor_user_id_idempotency_key ON file_upload_intents(actor_user_id, idempotency_key);

CREATE FUNCTION preserve_file_upload_intent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uploader_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.asset_id, NEW.actor_user_id, NEW.idempotency_key, NEW.request_fingerprint, NEW.created_at)
       IS DISTINCT FROM ROW(OLD.asset_id, OLD.actor_user_id, OLD.idempotency_key, OLD.request_fingerprint, OLD.created_at)
       OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
      RAISE EXCEPTION 'upload intent identity and completion are immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  SELECT uploaded_by_user_id INTO uploader_id FROM file_assets WHERE id = NEW.asset_id FOR SHARE;
  IF uploader_id IS DISTINCT FROM NEW.actor_user_id THEN
    RAISE EXCEPTION 'upload intent actor must own its asset' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_file_upload_intents_preserve_identity BEFORE INSERT OR UPDATE ON file_upload_intents FOR EACH ROW EXECUTE FUNCTION preserve_file_upload_intent();

COMMIT;
