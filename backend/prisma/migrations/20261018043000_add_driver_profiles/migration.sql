BEGIN;
CREATE TYPE driver_status AS ENUM ('pending','active','inactive','suspended');
CREATE TABLE drivers (
 id uuid CONSTRAINT pk_drivers PRIMARY KEY,
 user_id uuid NOT NULL CONSTRAINT uq_drivers_user_id UNIQUE,
 status driver_status NOT NULL DEFAULT 'pending',
 date_of_birth date,
 home_address text,
 online_status boolean NOT NULL DEFAULT false,
 onboarded_at timestamptz(6),
 activated_by_user_id uuid,
 created_at timestamptz(6) NOT NULL,
 updated_at timestamptz(6) NOT NULL,
 CONSTRAINT fk_drivers_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT fk_drivers_activated_by_user_id FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT ck_drivers_activation_pair CHECK ((onboarded_at IS NULL) = (activated_by_user_id IS NULL)),
 CONSTRAINT ck_drivers_home_address_length CHECK (home_address IS NULL OR length(home_address) <= 2000)
);
CREATE INDEX ix_drivers_created_at_id ON drivers(created_at,id);
CREATE INDEX ix_drivers_status_created_at_id ON drivers(status,created_at,id);
CREATE FUNCTION enforce_driver_account_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM users WHERE id=NEW.user_id AND role='driver' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Driver profile requires a driver account' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_drivers_account_role BEFORE INSERT OR UPDATE OF user_id ON drivers FOR EACH ROW EXECUTE FUNCTION enforce_driver_account_role();
CREATE FUNCTION protect_driver_account_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.role <> 'driver' AND EXISTS (SELECT 1 FROM drivers WHERE user_id=OLD.id) THEN
  RAISE EXCEPTION 'Driver account role cannot change while its profile exists' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_users_driver_role BEFORE UPDATE OF role ON users FOR EACH ROW EXECUTE FUNCTION protect_driver_account_role();
COMMIT;
