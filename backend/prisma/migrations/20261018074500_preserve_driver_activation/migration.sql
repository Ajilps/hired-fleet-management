BEGIN;
CREATE FUNCTION preserve_driver_activation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE clean_types integer;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.onboarded_at IS NOT NULL
     AND ROW(NEW.onboarded_at, NEW.activated_by_user_id) IS DISTINCT FROM ROW(OLD.onboarded_at, OLD.activated_by_user_id) THEN
    RAISE EXCEPTION 'first activation identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    PERFORM 1 FROM users WHERE id = NEW.user_id AND is_active FOR SHARE;
    IF NOT FOUND OR NEW.onboarded_at IS NULL OR NEW.activated_by_user_id IS NULL THEN
      RAISE EXCEPTION 'activation requires an enabled account and activation identity' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM users WHERE id = NEW.activated_by_user_id AND role = 'admin' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'activation requires an admin actor' USING ERRCODE = '23514'; END IF;
    -- The service locks these rows through its transaction; database writes recheck too.
    PERFORM d.id FROM driver_documents d JOIN file_assets f ON f.id = d.file_asset_id
      WHERE d.driver_id = NEW.id AND d.is_current FOR SHARE OF d, f;
    SELECT count(DISTINCT d.document_type) INTO clean_types FROM driver_documents d JOIN file_assets f ON f.id = d.file_asset_id
      WHERE d.driver_id = NEW.id AND d.is_current AND f.driver_id = NEW.id
      AND f.uploaded_by_user_id = NEW.user_id AND f.purpose = 'driver_document' AND f.malware_scan_status = 'clean';
    IF clean_types <> 4 THEN RAISE EXCEPTION 'activation requires all four current clean documents' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_drivers_preserve_activation BEFORE INSERT OR UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION preserve_driver_activation();
COMMIT;
