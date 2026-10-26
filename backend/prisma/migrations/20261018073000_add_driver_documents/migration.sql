BEGIN;
CREATE TYPE document_type AS ENUM ('driving_license', 'aadhar', 'pan', 'pcc');
CREATE TABLE driver_documents (
  id uuid NOT NULL,
  driver_id uuid NOT NULL,
  document_type document_type NOT NULL,
  file_asset_id uuid NOT NULL,
  document_number_ciphertext varchar(1024),
  document_number_key_id varchar(64),
  masked_document_number varchar(104),
  expires_on date,
  is_current boolean NOT NULL DEFAULT true,
  uploaded_at timestamptz(6) NOT NULL,
  CONSTRAINT pk_driver_documents PRIMARY KEY(id),
  CONSTRAINT fk_driver_documents_driver_id FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_driver_documents_file_asset_id FOREIGN KEY(file_asset_id) REFERENCES file_assets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_driver_documents_encryption CHECK (
    (document_number_ciphertext IS NULL AND document_number_key_id IS NULL AND masked_document_number IS NULL)
    OR (document_number_ciphertext IS NOT NULL AND document_number_ciphertext ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'
      AND document_number_key_id IS NOT NULL AND document_number_key_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'
      AND masked_document_number IS NOT NULL AND masked_document_number LIKE '****%')
  )
);
CREATE UNIQUE INDEX uq_driver_documents_file_asset_id ON driver_documents(file_asset_id);
CREATE UNIQUE INDEX uq_current_driver_document_type ON driver_documents(driver_id, document_type) WHERE is_current;
CREATE INDEX ix_driver_documents_driver_id_uploaded_at_id ON driver_documents(driver_id, uploaded_at, id);
CREATE FUNCTION validate_driver_document_asset() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE asset file_assets%ROWTYPE; owner_id uuid;
BEGIN
  SELECT * INTO asset FROM file_assets WHERE id = NEW.file_asset_id FOR SHARE;
  SELECT user_id INTO owner_id FROM drivers WHERE id = NEW.driver_id FOR SHARE;
  IF asset.id IS NULL OR asset.driver_id IS DISTINCT FROM NEW.driver_id OR asset.uploaded_by_user_id IS DISTINCT FROM owner_id
    OR asset.purpose <> 'driver_document' OR asset.malware_scan_status <> 'clean' THEN
    RAISE EXCEPTION 'document requires an owned clean contextual file' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_driver_documents_validate_asset BEFORE INSERT ON driver_documents FOR EACH ROW EXECUTE FUNCTION validate_driver_document_asset();
CREATE FUNCTION preserve_driver_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'document history is retained until an approved retention workflow exists' USING ERRCODE = '23514';
  END IF;
  IF ROW(NEW.id,NEW.driver_id,NEW.document_type,NEW.file_asset_id,NEW.document_number_ciphertext,NEW.document_number_key_id,NEW.masked_document_number,NEW.expires_on,NEW.uploaded_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.driver_id,OLD.document_type,OLD.file_asset_id,OLD.document_number_ciphertext,OLD.document_number_key_id,OLD.masked_document_number,OLD.expires_on,OLD.uploaded_at)
    OR (NOT OLD.is_current AND NEW.is_current) THEN
    RAISE EXCEPTION 'document identity and encrypted content are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_driver_documents_preserve BEFORE UPDATE OR DELETE ON driver_documents FOR EACH ROW EXECUTE FUNCTION preserve_driver_document();
COMMIT;
