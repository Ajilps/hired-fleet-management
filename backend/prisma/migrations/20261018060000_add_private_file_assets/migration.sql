BEGIN;

-- Additive foundation only. No upload, scanner or attachment endpoint is enabled.
CREATE TABLE file_assets (
  id uuid NOT NULL,
  storage_key varchar(500) NOT NULL,
  original_filename varchar(255) NOT NULL,
  mime_type varchar(100) NOT NULL,
  byte_size bigint NOT NULL,
  checksum_sha256 char(64) NOT NULL,
  malware_scan_status varchar(20) NOT NULL DEFAULT 'pending',
  purpose varchar(40) NOT NULL,
  driver_id uuid NOT NULL,
  uploaded_by_user_id uuid NOT NULL,
  created_at timestamptz(6) NOT NULL,
  CONSTRAINT pk_file_assets PRIMARY KEY (id),
  CONSTRAINT fk_file_assets_driver_id FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_file_assets_uploaded_by_user_id FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_file_assets_byte_size CHECK (byte_size > 0 AND byte_size <= 9007199254740991),
  CONSTRAINT ck_file_assets_checksum_sha256 CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_file_assets_scan_status CHECK (malware_scan_status IN ('pending', 'clean', 'rejected')),
  CONSTRAINT ck_file_assets_driver_document_context CHECK (purpose = 'driver_document'),
  CONSTRAINT ck_file_assets_storage_key CHECK (storage_key = 'quarantine/' || id::text),
  CONSTRAINT ck_file_assets_original_filename CHECK (length(btrim(original_filename)) > 0),
  CONSTRAINT ck_file_assets_mime_type CHECK (length(btrim(mime_type)) > 0)
);
CREATE UNIQUE INDEX uq_file_assets_storage_key ON file_assets(storage_key);
CREATE INDEX ix_file_assets_uploaded_by_user_id_created_at_id ON file_assets(uploaded_by_user_id, created_at, id);
CREATE INDEX ix_file_assets_driver_id_created_at_id ON file_assets(driver_id, created_at, id);

-- Admins may upload for a real driver; a driver can only upload for their own profile.
-- Lock the uploader during the write so a concurrent role change cannot defeat the check.
CREATE FUNCTION validate_file_asset_uploader() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uploader_role user_role; driver_user_id uuid;
BEGIN
  SELECT role INTO uploader_role FROM users WHERE id = NEW.uploaded_by_user_id FOR SHARE;
  SELECT user_id INTO driver_user_id FROM drivers WHERE id = NEW.driver_id FOR SHARE;
  IF uploader_role = 'partner' OR (uploader_role = 'driver' AND driver_user_id IS DISTINCT FROM NEW.uploaded_by_user_id) THEN
    RAISE EXCEPTION 'file uploader does not match driver context' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_file_assets_validate_uploader BEFORE INSERT ON file_assets FOR EACH ROW EXECUTE FUNCTION validate_file_asset_uploader();

CREATE FUNCTION preserve_file_asset_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.storage_key, NEW.original_filename, NEW.mime_type, NEW.byte_size, NEW.checksum_sha256, NEW.purpose, NEW.driver_id, NEW.uploaded_by_user_id, NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id, OLD.storage_key, OLD.original_filename, OLD.mime_type, OLD.byte_size, OLD.checksum_sha256, OLD.purpose, OLD.driver_id, OLD.uploaded_by_user_id, OLD.created_at) THEN
    RAISE EXCEPTION 'file identity and content metadata are immutable' USING ERRCODE = '23514';
  END IF;
  -- No scanner exists in this increment. Terminal results cannot be rewritten.
  IF OLD.malware_scan_status <> 'pending' AND NEW.malware_scan_status IS DISTINCT FROM OLD.malware_scan_status THEN
    RAISE EXCEPTION 'file scan result is terminal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_file_assets_preserve_identity BEFORE UPDATE ON file_assets FOR EACH ROW EXECUTE FUNCTION preserve_file_asset_identity();

COMMIT;
