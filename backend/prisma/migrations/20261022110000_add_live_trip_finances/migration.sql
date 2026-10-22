-- Live execution, immutable closure/earnings and reviewed monthly statements.
CREATE TABLE "trip_expenses" (
 "id" UUID NOT NULL,
 "trip_id" UUID NOT NULL,
 "driver_id" UUID NOT NULL,
 "expense_type" VARCHAR(50) NOT NULL DEFAULT 'other',
 "amount" DECIMAL(12,2) NOT NULL,
 "description" VARCHAR(500) NOT NULL,
 "receipt_file_asset_id" UUID,
 "logged_at" TIMESTAMPTZ(3) NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL,
 "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "pk_trip_expenses" PRIMARY KEY ("id")
);
CREATE INDEX "ix_trip_expenses_trip_id_logged_at_id" ON "trip_expenses" ("trip_id", "logged_at", "id");
CREATE TABLE "trip_payroll_records" (
 "id" UUID NOT NULL,
 "trip_id" UUID NOT NULL,
 "driver_id" UUID NOT NULL,
 "company_id" UUID NOT NULL,
 "trip_amount" DECIMAL(12,2) NOT NULL,
 "applied_driver_percent" DECIMAL(5,2) NOT NULL,
 "applied_company_percent" DECIMAL(5,2) NOT NULL,
 "driver_share_amount" DECIMAL(12,2) NOT NULL,
 "company_share_amount" DECIMAL(12,2) NOT NULL,
 "payout_status" VARCHAR(20) NOT NULL DEFAULT 'credited',
 "partner_payment_status" VARCHAR(20) NOT NULL DEFAULT 'unpaid',
 "calculated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "pk_trip_payroll_records" PRIMARY KEY ("id"),
 CONSTRAINT "uq_trip_payroll_records_trip_id" UNIQUE ("trip_id")
);
CREATE INDEX "ix_trip_payroll_records_driver_calculated_id" ON "trip_payroll_records" ("driver_id", "calculated_at", "id");
CREATE INDEX "ix_trip_payroll_records_company_calculated_id" ON "trip_payroll_records" ("company_id", "calculated_at", "id");
CREATE TABLE "trip_reports" (
 "id" UUID NOT NULL,
 "trip_id" UUID NOT NULL,
 "payroll_record_id" UUID NOT NULL,
 "driver_id" UUID NOT NULL,
 "company_id" UUID NOT NULL,
 "started_at" TIMESTAMPTZ(3) NOT NULL,
 "closed_at" TIMESTAMPTZ(3) NOT NULL,
 "total_expense_amount" DECIMAL(12,2) NOT NULL,
 "snapshot_version" INTEGER NOT NULL DEFAULT 1,
 "report_snapshot" JSONB NOT NULL,
 "generated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "pk_trip_reports" PRIMARY KEY ("id"),
 CONSTRAINT "uq_trip_reports_trip_id" UNIQUE ("trip_id"),
 CONSTRAINT "uq_trip_reports_payroll_record_id" UNIQUE ("payroll_record_id")
);
CREATE INDEX "ix_trip_reports_generated_at_id" ON "trip_reports" ("generated_at", "id");
CREATE TABLE "wallet_accounts" (
 "driver_id" UUID NOT NULL,
 "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
 "updated_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "pk_wallet_accounts" PRIMARY KEY ("driver_id")
);
CREATE TABLE "wallet_transactions" (
 "id" UUID NOT NULL,
 "driver_id" UUID NOT NULL,
 "trip_id" UUID NOT NULL,
 "payroll_record_id" UUID NOT NULL,
 "transaction_type" VARCHAR(20) NOT NULL DEFAULT 'trip_credit',
 "amount" DECIMAL(12,2) NOT NULL,
 "idempotency_key" VARCHAR(100) NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "pk_wallet_transactions" PRIMARY KEY ("id"),
 CONSTRAINT "uq_wallet_transactions_trip_id" UNIQUE ("trip_id"),
 CONSTRAINT "uq_wallet_transactions_payroll_record_id" UNIQUE ("payroll_record_id"),
 CONSTRAINT "uq_wallet_transactions_idempotency_key" UNIQUE ("idempotency_key")
);
CREATE INDEX "ix_wallet_transactions_driver_created_id" ON "wallet_transactions" ("driver_id", "created_at", "id");
CREATE TABLE "statements" (
 "id" UUID NOT NULL,
 "company_id" UUID NOT NULL,
 "period_start" DATE NOT NULL,
 "period_end" DATE NOT NULL,
 "billing_timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
 "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
 "content_version" INTEGER NOT NULL DEFAULT 1,
 "version" BIGINT NOT NULL DEFAULT 1,
 "total_trip_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
 "total_driver_share" DECIMAL(14,2) NOT NULL DEFAULT 0,
 "total_company_share" DECIMAL(14,2) NOT NULL DEFAULT 0,
 "created_by_user_id" UUID NOT NULL,
 "created_at" TIMESTAMPTZ(3) NOT NULL,
 "submitted_at" TIMESTAMPTZ(3),
 "verified_at" TIMESTAMPTZ(3),
 "published_at" TIMESTAMPTZ(3),
 "published_by_user_id" UUID,
 CONSTRAINT "pk_statements" PRIMARY KEY ("id"),
 CONSTRAINT "uq_statements_company_id_period_start" UNIQUE ("company_id", "period_start")
);
CREATE INDEX "ix_statements_created_at_id" ON "statements" ("created_at", "id");
CREATE TABLE "statement_items" (
 "statement_id" UUID NOT NULL,
 "trip_payroll_record_id" UUID NOT NULL,
 "trip_amount" DECIMAL(12,2) NOT NULL,
 "applied_driver_percent" DECIMAL(5,2) NOT NULL,
 "applied_company_percent" DECIMAL(5,2) NOT NULL,
 "driver_share_amount" DECIMAL(12,2) NOT NULL,
 "company_share_amount" DECIMAL(12,2) NOT NULL,
 CONSTRAINT "uq_statement_items_payroll_record_id" UNIQUE ("trip_payroll_record_id"),
 CONSTRAINT "pk_statement_items" PRIMARY KEY ("statement_id", "trip_payroll_record_id")
);
CREATE TABLE "statement_approvals" (
 "id" UUID NOT NULL,
 "statement_id" UUID NOT NULL,
 "admin_user_id" UUID NOT NULL,
 "content_version" INTEGER NOT NULL,
 "approved_at" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "pk_statement_approvals" PRIMARY KEY ("id"),
 CONSTRAINT "uq_statement_approvals_statement_admin" UNIQUE ("statement_id", "admin_user_id")
);
ALTER TABLE trip_expenses ADD CONSTRAINT fk_trip_expenses_trip_id FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE RESTRICT;
ALTER TABLE trip_expenses ADD CONSTRAINT fk_trip_expenses_driver_id FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT;
ALTER TABLE trip_expenses ADD CONSTRAINT fk_trip_expenses_receipt_file_asset_id FOREIGN KEY (receipt_file_asset_id) REFERENCES file_assets(id) ON DELETE RESTRICT;
ALTER TABLE trip_payroll_records ADD CONSTRAINT fk_trip_payroll_records_trip_id FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE RESTRICT;
ALTER TABLE trip_payroll_records ADD CONSTRAINT fk_trip_payroll_records_driver_id FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT;
ALTER TABLE trip_payroll_records ADD CONSTRAINT fk_trip_payroll_records_company_id FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
ALTER TABLE trip_reports ADD CONSTRAINT fk_trip_reports_trip_id FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE RESTRICT;
ALTER TABLE trip_reports ADD CONSTRAINT fk_trip_reports_payroll_record_id FOREIGN KEY (payroll_record_id) REFERENCES trip_payroll_records(id) ON DELETE RESTRICT;
ALTER TABLE trip_reports ADD CONSTRAINT fk_trip_reports_driver_id FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT;
ALTER TABLE trip_reports ADD CONSTRAINT fk_trip_reports_company_id FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
ALTER TABLE wallet_accounts ADD CONSTRAINT fk_wallet_accounts_driver_id FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT;
ALTER TABLE wallet_transactions ADD CONSTRAINT fk_wallet_transactions_driver_id FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT;
ALTER TABLE wallet_transactions ADD CONSTRAINT fk_wallet_transactions_trip_id FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE RESTRICT;
ALTER TABLE wallet_transactions ADD CONSTRAINT fk_wallet_transactions_payroll_record_id FOREIGN KEY (payroll_record_id) REFERENCES trip_payroll_records(id) ON DELETE RESTRICT;
ALTER TABLE statements ADD CONSTRAINT fk_statements_company_id FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
ALTER TABLE statements ADD CONSTRAINT fk_statements_created_by_user_id FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE statements ADD CONSTRAINT fk_statements_published_by_user_id FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE statement_items ADD CONSTRAINT fk_statement_items_statement_id FOREIGN KEY (statement_id) REFERENCES statements(id) ON DELETE RESTRICT;
ALTER TABLE statement_items ADD CONSTRAINT fk_statement_items_trip_payroll_record_id FOREIGN KEY (trip_payroll_record_id) REFERENCES trip_payroll_records(id) ON DELETE RESTRICT;
ALTER TABLE statement_approvals ADD CONSTRAINT fk_statement_approvals_statement_id FOREIGN KEY (statement_id) REFERENCES statements(id) ON DELETE RESTRICT;
ALTER TABLE statement_approvals ADD CONSTRAINT fk_statement_approvals_admin_user_id FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE trip_expenses ADD CONSTRAINT ck_trip_expenses_values CHECK (amount > 0 AND btrim(description) <> '' AND btrim(expense_type) <> '');
ALTER TABLE trip_payroll_records ADD CONSTRAINT ck_trip_payroll_records_values CHECK (trip_amount >= 0 AND driver_share_amount >= 0 AND company_share_amount >= 0 AND driver_share_amount + company_share_amount = trip_amount AND applied_driver_percent > 0 AND applied_company_percent > 0 AND applied_driver_percent + applied_company_percent = 100 AND payout_status = 'credited' AND partner_payment_status IN ('unpaid','settled','disputed'));
ALTER TABLE trip_reports ADD CONSTRAINT ck_trip_reports_values CHECK (snapshot_version = 1 AND total_expense_amount >= 0 AND closed_at >= started_at AND jsonb_typeof(report_snapshot) = 'object');
ALTER TABLE wallet_accounts ADD CONSTRAINT ck_wallet_accounts_balance CHECK (balance >= 0);
ALTER TABLE wallet_transactions ADD CONSTRAINT ck_wallet_transactions_credit CHECK (transaction_type = 'trip_credit' AND amount >= 0 AND idempotency_key = 'close-trip:' || trip_id::text);
ALTER TABLE statements ADD CONSTRAINT ck_statements_values CHECK (billing_timezone = 'Asia/Kolkata' AND content_version > 0 AND version > 0 AND period_start = date_trunc('month',period_start)::date AND period_end = (period_start + interval '1 month')::date AND total_trip_amount >= 0 AND total_driver_share >= 0 AND total_company_share >= 0 AND total_driver_share + total_company_share = total_trip_amount AND (
 (status='draft' AND submitted_at IS NULL AND verified_at IS NULL AND published_at IS NULL AND published_by_user_id IS NULL) OR
 (status='pending_verification' AND submitted_at IS NOT NULL AND verified_at IS NULL AND published_at IS NULL AND published_by_user_id IS NULL) OR
 (status='verified' AND submitted_at IS NOT NULL AND verified_at IS NOT NULL AND published_at IS NULL AND published_by_user_id IS NULL) OR
 (status='published' AND submitted_at IS NOT NULL AND verified_at IS NOT NULL AND published_at IS NOT NULL AND published_by_user_id IS NOT NULL)));
ALTER TABLE statement_items ADD CONSTRAINT ck_statement_items_values CHECK (trip_amount >= 0 AND driver_share_amount >= 0 AND company_share_amount >= 0 AND driver_share_amount+company_share_amount=trip_amount AND applied_driver_percent>0 AND applied_company_percent>0 AND applied_driver_percent+applied_company_percent=100);
ALTER TABLE statement_approvals ADD CONSTRAINT ck_statement_approvals_version CHECK (content_version>0);
ALTER TABLE notifications DROP CONSTRAINT ck_notifications_event;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_statement_id FOREIGN KEY(statement_id) REFERENCES statements(id) ON DELETE RESTRICT;
ALTER TABLE notifications ADD CONSTRAINT ck_notifications_event CHECK (channel='email' AND ((event_type IN ('order_accepted','order_rejected') AND order_id IS NOT NULL AND statement_id IS NULL) OR (event_type='statement_published' AND statement_id IS NOT NULL AND order_id IS NULL)));
CREATE FUNCTION deny_financial_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable financial record' USING ERRCODE='23514'; END $$;
CREATE TRIGGER trg_trip_reports_immutable BEFORE UPDATE OR DELETE ON trip_reports FOR EACH ROW EXECUTE FUNCTION deny_financial_rewrite();
CREATE TRIGGER trg_trip_reports_no_truncate BEFORE TRUNCATE ON trip_reports FOR EACH STATEMENT EXECUTE FUNCTION deny_financial_rewrite();
CREATE TRIGGER trg_wallet_transactions_immutable BEFORE UPDATE OR DELETE ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION deny_financial_rewrite();
CREATE TRIGGER trg_wallet_transactions_no_truncate BEFORE TRUNCATE ON wallet_transactions FOR EACH STATEMENT EXECUTE FUNCTION deny_financial_rewrite();
CREATE FUNCTION guard_payroll_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'immutable payroll' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-'partner_payment_status') IS DISTINCT FROM (to_jsonb(OLD)-'partner_payment_status') THEN RAISE EXCEPTION 'immutable payroll' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_payroll_history BEFORE UPDATE OR DELETE ON trip_payroll_records FOR EACH ROW EXECUTE FUNCTION guard_payroll_history();
CREATE TRIGGER trg_payroll_no_truncate BEFORE TRUNCATE ON trip_payroll_records FOR EACH STATEMENT EXECUTE FUNCTION deny_financial_rewrite();
CREATE FUNCTION guard_trip_execution() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='closed' THEN RAISE EXCEPTION 'closed trip is immutable' USING ERRCODE='23514'; END IF;
 IF (to_jsonb(NEW)-ARRAY['otp_failed_attempts','otp_locked_until','updated_at']) = (to_jsonb(OLD)-ARRAY['otp_failed_attempts','otp_locked_until','updated_at']) THEN RETURN NEW; END IF;
 IF NEW.version <= OLD.version THEN RAISE EXCEPTION 'trip version must advance' USING ERRCODE='23514'; END IF;
 IF NEW.status='ongoing' AND (NEW.started_at IS NULL OR NEW.assigned_at IS NULL) THEN RAISE EXCEPTION 'trip start requires assignment' USING ERRCODE='23514'; END IF;
 IF NEW.status='closed' AND (NEW.closed_at IS NULL OR NEW.started_at IS NULL OR NEW.expenses_confirmed_at IS NULL OR NEW.expenses_confirmed_by_driver_id IS DISTINCT FROM NEW.current_driver_id OR NEW.otp_verified_at IS NULL) THEN RAISE EXCEPTION 'incomplete trip closure' USING ERRCODE='23514'; END IF;
 IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN RAISE EXCEPTION 'original start is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_trip_execution BEFORE UPDATE ON trips FOR EACH ROW EXECUTE FUNCTION guard_trip_execution();
CREATE FUNCTION guard_trip_expense() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid; owner uuid; state text; current_driver uuid; BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.trip_id ELSE NEW.trip_id END;
 owner:=CASE WHEN TG_OP='DELETE' THEN OLD.driver_id ELSE NEW.driver_id END;
 SELECT status,current_driver_id INTO state,current_driver FROM trips WHERE id=target FOR UPDATE;
 IF state<>'ongoing' OR current_driver IS DISTINCT FROM owner THEN RAISE EXCEPTION 'expense access/state invalid' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id,NEW.trip_id,NEW.driver_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.trip_id,OLD.driver_id,OLD.created_at) THEN RAISE EXCEPTION 'expense identity immutable' USING ERRCODE='23514'; END IF;
 UPDATE trips SET expenses_confirmed_at=NULL,expenses_confirmed_by_driver_id=NULL,version=version+1,updated_at=date_trunc('milliseconds',clock_timestamp()) WHERE id=target;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER trg_trip_expenses_guard BEFORE INSERT OR UPDATE OR DELETE ON trip_expenses FOR EACH ROW EXECUTE FUNCTION guard_trip_expense();
CREATE FUNCTION verify_trip_financial_integrity() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p trip_payroll_records; w wallet_transactions; r trip_reports; BEGIN
 IF NEW.status<>'closed' THEN RETURN NULL; END IF;
 SELECT * INTO p FROM trip_payroll_records WHERE trip_id=NEW.id;
 SELECT * INTO w FROM wallet_transactions WHERE trip_id=NEW.id;
 SELECT * INTO r FROM trip_reports WHERE trip_id=NEW.id;
 IF p.id IS NULL OR w.id IS NULL OR r.id IS NULL OR (p.driver_id,p.company_id,p.trip_amount) IS DISTINCT FROM (NEW.current_driver_id,NEW.company_id,NEW.total_amount) OR (w.driver_id,w.payroll_record_id,w.amount) IS DISTINCT FROM (p.driver_id,p.id,p.driver_share_amount) OR (r.driver_id,r.company_id,r.payroll_record_id,r.closed_at) IS DISTINCT FROM (p.driver_id,p.company_id,p.id,NEW.closed_at) OR r.total_expense_amount IS DISTINCT FROM (SELECT COALESCE(sum(amount),0) FROM trip_expenses WHERE trip_id=NEW.id) OR EXISTS(SELECT 1 FROM trip_assignments WHERE trip_id=NEW.id AND status='active') OR NOT EXISTS(SELECT 1 FROM trip_assignments WHERE trip_id=NEW.id AND driver_id=p.driver_id AND status='completed' AND ended_at=NEW.closed_at) THEN RAISE EXCEPTION 'trip financial integrity violation' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_trip_financial_integrity AFTER INSERT OR UPDATE ON trips DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_trip_financial_integrity();
CREATE FUNCTION verify_wallet_balance() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE owner uuid; expected numeric; actual numeric; BEGIN
 owner:=NEW.driver_id; SELECT COALESCE(sum(amount),0) INTO expected FROM wallet_transactions WHERE driver_id=owner; SELECT balance INTO actual FROM wallet_accounts WHERE driver_id=owner;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'wallet balance mismatch' USING ERRCODE='23514'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_wallet_balance_account AFTER INSERT OR UPDATE ON wallet_accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_wallet_balance();
CREATE CONSTRAINT TRIGGER trg_wallet_balance_ledger AFTER INSERT ON wallet_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_wallet_balance();
CREATE FUNCTION guard_statement_content() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'statement history is retained' USING ERRCODE='23514'; END IF;
 IF (NEW.id,NEW.company_id,NEW.period_start,NEW.period_end,NEW.billing_timezone,NEW.created_by_user_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.company_id,OLD.period_start,OLD.period_end,OLD.billing_timezone,OLD.created_by_user_id,OLD.created_at) THEN RAISE EXCEPTION 'statement identity immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status<>'draft' AND (NEW.content_version,NEW.total_trip_amount,NEW.total_driver_share,NEW.total_company_share) IS DISTINCT FROM (OLD.content_version,OLD.total_trip_amount,OLD.total_driver_share,OLD.total_company_share) THEN RAISE EXCEPTION 'submitted statement frozen' USING ERRCODE='23514'; END IF;
 IF NEW.version<=OLD.version OR NOT ((OLD.status='draft' AND NEW.status IN ('draft','pending_verification')) OR (OLD.status='pending_verification' AND NEW.status IN ('pending_verification','verified')) OR (OLD.status='verified' AND NEW.status='published')) THEN RAISE EXCEPTION 'invalid statement transition' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_statement_content BEFORE UPDATE OR DELETE ON statements FOR EACH ROW EXECUTE FUNCTION guard_statement_content();
CREATE FUNCTION guard_statement_item() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE s statements; p trip_payroll_records; target uuid; BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.statement_id ELSE NEW.statement_id END;
 SELECT * INTO s FROM statements WHERE id=target FOR UPDATE;
 IF s.status<>'draft' THEN RAISE EXCEPTION 'statement items frozen' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'regenerate draft instead' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT * INTO p FROM trip_payroll_records WHERE id=NEW.trip_payroll_record_id;
 IF p.id IS NULL OR p.company_id<>s.company_id OR p.calculated_at < (s.period_start::timestamp AT TIME ZONE 'Asia/Kolkata') OR p.calculated_at >= (s.period_end::timestamp AT TIME ZONE 'Asia/Kolkata') OR (NEW.trip_amount,NEW.applied_driver_percent,NEW.applied_company_percent,NEW.driver_share_amount,NEW.company_share_amount) IS DISTINCT FROM (p.trip_amount,p.applied_driver_percent,p.applied_company_percent,p.driver_share_amount,p.company_share_amount) THEN RAISE EXCEPTION 'statement item not canonical payroll' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_statement_item BEFORE INSERT OR UPDATE OR DELETE ON statement_items FOR EACH ROW EXECUTE FUNCTION guard_statement_item();
CREATE FUNCTION guard_statement_approval() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE s statements; BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'approval immutable' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM statements WHERE id=NEW.statement_id FOR UPDATE;
 IF s.status<>'pending_verification' OR NEW.content_version<>s.content_version OR (SELECT count(*) FROM statement_approvals WHERE statement_id=s.id)>=2 OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.admin_user_id AND role='admin' AND is_active) THEN RAISE EXCEPTION 'invalid approval' USING ERRCODE='23514'; END IF;
 IF NEW.admin_user_id<>s.created_by_user_id AND EXISTS(SELECT 1 FROM statement_approvals WHERE statement_id=s.id AND admin_user_id<>s.created_by_user_id) THEN RAISE EXCEPTION 'creator approval required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_statement_approval BEFORE INSERT OR UPDATE OR DELETE ON statement_approvals FOR EACH ROW EXECUTE FUNCTION guard_statement_approval();
CREATE FUNCTION verify_statement_integrity() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE target uuid; s statements; total numeric; driver numeric; company numeric; approvals integer; BEGIN
 IF TG_TABLE_NAME='statements' THEN target:=NEW.id; ELSE target:=CASE WHEN TG_OP='DELETE' THEN OLD.statement_id ELSE NEW.statement_id END; END IF;
 SELECT * INTO s FROM statements WHERE id=target;
 SELECT COALESCE(sum(trip_amount),0),COALESCE(sum(driver_share_amount),0),COALESCE(sum(company_share_amount),0) INTO total,driver,company FROM statement_items WHERE statement_id=target;
 IF (s.total_trip_amount,s.total_driver_share,s.total_company_share) IS DISTINCT FROM (total,driver,company) OR NOT EXISTS(SELECT 1 FROM statement_items WHERE statement_id=target) THEN RAISE EXCEPTION 'statement totals mismatch' USING ERRCODE='23514'; END IF;
 IF s.status IN ('verified','published') THEN
  SELECT count(*) INTO approvals FROM statement_approvals WHERE statement_id=target AND content_version=s.content_version;
  IF approvals<>2 OR NOT EXISTS(SELECT 1 FROM statement_approvals WHERE statement_id=target AND admin_user_id=s.created_by_user_id AND content_version=s.content_version) THEN RAISE EXCEPTION 'creator plus second approval required' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_statements_integrity AFTER INSERT OR UPDATE ON statements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_statement_integrity();
CREATE CONSTRAINT TRIGGER trg_statement_items_integrity AFTER INSERT OR UPDATE OR DELETE ON statement_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_statement_integrity();

CREATE FUNCTION verify_closed_financial_reference() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE t trips; BEGIN
 SELECT * INTO t FROM trips WHERE id=NEW.trip_id;
 IF t.status<>'closed' THEN RAISE EXCEPTION 'financial records require closed trip' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_payroll_closed_reference AFTER INSERT ON trip_payroll_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_closed_financial_reference();
CREATE CONSTRAINT TRIGGER trg_report_closed_reference AFTER INSERT ON trip_reports DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_closed_financial_reference();
CREATE CONSTRAINT TRIGGER trg_credit_closed_reference AFTER INSERT ON wallet_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_closed_financial_reference();
CREATE TRIGGER trg_statements_no_truncate BEFORE TRUNCATE ON statements FOR EACH STATEMENT EXECUTE FUNCTION deny_financial_rewrite();
CREATE TRIGGER trg_statement_items_no_truncate BEFORE TRUNCATE ON statement_items FOR EACH STATEMENT EXECUTE FUNCTION deny_financial_rewrite();
CREATE TRIGGER trg_statement_approvals_no_truncate BEFORE TRUNCATE ON statement_approvals FOR EACH STATEMENT EXECUTE FUNCTION deny_financial_rewrite();
