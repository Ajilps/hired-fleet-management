BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "contact_name" VARCHAR(150) NOT NULL,
    "contact_email" VARCHAR(255) NOT NULL,
    "contact_phone" VARCHAR(30) NOT NULL,
    "billing_address" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pk_companies" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_users" (
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_primary_contact" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pk_company_users" PRIMARY KEY ("company_id","user_id")
);

-- CreateTable
CREATE TABLE "company_payout_rates" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "driver_percent" DECIMAL(5,2) NOT NULL,
    "company_percent" DECIMAL(5,2) NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "effective_to" TIMESTAMPTZ(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pk_company_payout_rates" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_companies_created_at_id" ON "companies"("created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_partner_company_membership" ON "company_users"("user_id");

-- CreateIndex
CREATE INDEX "ix_company_payout_rates_company_id_created_at_id" ON "company_payout_rates"("company_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_company_payout_rates_company_id_effective_from" ON "company_payout_rates"("company_id", "effective_from");

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "fk_company_users_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "fk_company_users_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_payout_rates" ADD CONSTRAINT "fk_company_payout_rates_company_id" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_payout_rates" ADD CONSTRAINT "fk_company_payout_rates_created_by_user_id" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE companies
  ADD CONSTRAINT ck_companies_nonblank CHECK (length(btrim(legal_name)) > 0 AND length(btrim(display_name)) > 0 AND length(btrim(contact_name)) > 0 AND length(btrim(contact_email)) > 0 AND length(btrim(contact_phone)) > 0 AND length(btrim(billing_address)) > 0),
  ADD CONSTRAINT ck_companies_billing_length CHECK (length(billing_address) <= 4000);
ALTER TABLE company_payout_rates
  ADD CONSTRAINT ck_company_payout_rates_split CHECK (driver_percent > 0 AND company_percent > 0 AND driver_percent + company_percent = 100.00),
  ADD CONSTRAINT ck_company_payout_rates_interval CHECK (effective_to IS NULL OR effective_to > effective_from),
  ADD CONSTRAINT ex_company_payout_rates_no_overlap EXCLUDE USING gist (company_id WITH =, tstzrange(effective_from, effective_to, '[)') WITH &&);
CREATE UNIQUE INDEX uq_company_payout_rates_one_open ON company_payout_rates (company_id) WHERE effective_to IS NULL;

CREATE FUNCTION protect_payout_rate_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.effective_to IS NULL AND NEW.effective_to IS NOT NULL AND
      ROW(NEW.id, NEW.company_id, NEW.driver_percent, NEW.company_percent, NEW.effective_from, NEW.created_by_user_id, NEW.created_at)
      IS NOT DISTINCT FROM ROW(OLD.id, OLD.company_id, OLD.driver_percent, OLD.company_percent, OLD.effective_from, OLD.created_by_user_id, OLD.created_at) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Payout rate history is immutable except closing an open interval.' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER trg_company_payout_rates_history BEFORE UPDATE OR DELETE ON company_payout_rates
FOR EACH ROW EXECUTE FUNCTION protect_payout_rate_history();
CREATE TRIGGER trg_company_payout_rates_no_truncate BEFORE TRUNCATE ON company_payout_rates
FOR EACH STATEMENT EXECUTE FUNCTION protect_payout_rate_history();

CREATE FUNCTION check_partner_membership_role() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE member_role user_role;
BEGIN
  SELECT role INTO member_role FROM users WHERE id = NEW.user_id FOR SHARE;
  IF member_role IS DISTINCT FROM 'partner'::user_role THEN
    RAISE EXCEPTION 'Company membership requires a partner account.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_company_users_partner_role BEFORE INSERT OR UPDATE ON company_users
FOR EACH ROW EXECUTE FUNCTION check_partner_membership_role();
CREATE FUNCTION protect_partner_membership_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role <> 'partner'::user_role AND EXISTS (SELECT 1 FROM company_users WHERE user_id = NEW.id) THEN
    RAISE EXCEPTION 'A company member must remain a partner account.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_users_membership_role BEFORE UPDATE OF role ON users
FOR EACH ROW EXECUTE FUNCTION protect_partner_membership_role();
COMMIT;
