-- Preserve exact closure-effective timing and rounding even for direct SQL writes.
ALTER TABLE trip_payroll_records ADD CONSTRAINT ck_trip_payroll_records_rounding CHECK (driver_share_amount = round(trip_amount * applied_driver_percent / 100, 2));
CREATE FUNCTION verify_closure_rate() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p trip_payroll_records; BEGIN
 IF NEW.status<>'closed' THEN RETURN NULL; END IF;
 SELECT * INTO p FROM trip_payroll_records WHERE trip_id=NEW.id;
 IF p.id IS NULL OR p.calculated_at IS DISTINCT FROM NEW.closed_at OR NOT EXISTS(
  SELECT 1 FROM company_payout_rates rate WHERE rate.company_id=NEW.company_id
  AND rate.effective_from<=NEW.closed_at AND (rate.effective_to IS NULL OR rate.effective_to>NEW.closed_at)
  AND rate.driver_percent=p.applied_driver_percent AND rate.company_percent=p.applied_company_percent
 ) THEN RAISE EXCEPTION 'closure rate/time mismatch' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_trip_closure_rate AFTER INSERT OR UPDATE ON trips DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_closure_rate();
