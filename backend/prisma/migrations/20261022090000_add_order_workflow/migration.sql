-- Additive M4 workflow tables; reviewed mapped types and integrity.
CREATE TABLE "orders" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "source" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'received',
  "requested_pickup_at" TIMESTAMPTZ(3) NOT NULL,
  "rejection_reason" TEXT,
  "accepted_by_user_id" UUID,
  "accepted_at" TIMESTAMPTZ(3),
  "rejected_by_user_id" UUID,
  "rejected_at" TIMESTAMPTZ(3),
  "pickup_address" TEXT NOT NULL,
  "pickup_lat" DECIMAL(9,6),
  "pickup_lng" DECIMAL(9,6),
  "drop_address" TEXT NOT NULL,
  "drop_lat" DECIMAL(9,6),
  "drop_lng" DECIMAL(9,6),
  "contact_name" VARCHAR(150) NOT NULL,
  "contact_phone" VARCHAR(30) NOT NULL,
  "vehicle_notes" TEXT,
  "service_notes" TEXT,
  "route_distance_km" DECIMAL(10,2),
  "estimated_duration_minutes" INTEGER,
  "estimated_duration_source" VARCHAR(20),
  "estimate_average_speed_kmh" DECIMAL(6,2),
  "estimate_policy_version" VARCHAR(50),
  "admin_eta_minutes" INTEGER,
  "eta_source" VARCHAR(20),
  "eta_calculated_at" TIMESTAMPTZ(3),
  "eta_updated_at" TIMESTAMPTZ(3),
  "eta_overridden_by_user_id" UUID,
  "version" BIGINT NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pk_orders" PRIMARY KEY ("id"),
  CONSTRAINT "uq_orders_id_company_id" UNIQUE ("id", "company_id")
);
CREATE INDEX "ix_orders_company_id_created_at_id" ON "orders" ("company_id", "created_at", "id");
CREATE INDEX "ix_orders_status_created_at_id" ON "orders" ("status", "created_at", "id");
CREATE INDEX "ix_orders_created_at_id" ON "orders" ("created_at", "id");
CREATE TABLE "trips" (
  "id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'unassigned',
  "current_driver_id" UUID,
  "total_amount" DECIMAL(12,2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'INR',
  "scheduled_pickup_at" TIMESTAMPTZ(3) NOT NULL,
  "otp_hash" VARCHAR(255) NOT NULL,
  "otp_encrypted_value" VARCHAR(255) NOT NULL,
  "otp_key_id" VARCHAR(64) NOT NULL,
  "otp_generated_at" TIMESTAMPTZ(3) NOT NULL,
  "otp_expires_at" TIMESTAMPTZ(3),
  "otp_verified_at" TIMESTAMPTZ(3),
  "otp_failed_attempts" SMALLINT NOT NULL DEFAULT 0,
  "otp_locked_until" TIMESTAMPTZ(3),
  "expenses_confirmed_at" TIMESTAMPTZ(3),
  "expenses_confirmed_by_driver_id" UUID,
  "assigned_at" TIMESTAMPTZ(3),
  "started_at" TIMESTAMPTZ(3),
  "closed_at" TIMESTAMPTZ(3),
  "pickup_address" TEXT NOT NULL,
  "pickup_lat" DECIMAL(9,6),
  "pickup_lng" DECIMAL(9,6),
  "drop_address" TEXT NOT NULL,
  "drop_lat" DECIMAL(9,6),
  "drop_lng" DECIMAL(9,6),
  "contact_name" VARCHAR(150) NOT NULL,
  "contact_phone" VARCHAR(30) NOT NULL,
  "vehicle_notes" TEXT,
  "service_notes" TEXT,
  "route_distance_km" DECIMAL(10,2),
  "estimated_duration_minutes" INTEGER,
  "estimated_duration_source" VARCHAR(20),
  "estimate_average_speed_kmh" DECIMAL(6,2),
  "estimate_policy_version" VARCHAR(50),
  "admin_eta_minutes" INTEGER,
  "eta_source" VARCHAR(20),
  "eta_calculated_at" TIMESTAMPTZ(3),
  "eta_updated_at" TIMESTAMPTZ(3),
  "eta_overridden_by_user_id" UUID,
  "version" BIGINT NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pk_trips" PRIMARY KEY ("id"),
  CONSTRAINT "uq_trips_order_id" UNIQUE ("order_id"),
  CONSTRAINT "uq_trips_order_id_company_id" UNIQUE ("order_id", "company_id")
);
CREATE INDEX "ix_trips_company_id_scheduled_pickup_at_id" ON "trips" ("company_id", "scheduled_pickup_at", "id");
CREATE INDEX "ix_trips_status_scheduled_pickup_at_id" ON "trips" ("status", "scheduled_pickup_at", "id");
CREATE INDEX "ix_trips_scheduled_pickup_at_id" ON "trips" ("scheduled_pickup_at", "id");
CREATE TABLE "trip_assignments" (
  "id" UUID NOT NULL,
  "trip_id" UUID NOT NULL,
  "driver_id" UUID NOT NULL,
  "assigned_by_user_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "assignment_reason" VARCHAR(250),
  "assigned_at" TIMESTAMPTZ(3) NOT NULL,
  "ended_at" TIMESTAMPTZ(3),
  CONSTRAINT "pk_trip_assignments" PRIMARY KEY ("id")
);
CREATE INDEX "ix_trip_assignments_trip_id_assigned_at_id" ON "trip_assignments" ("trip_id", "assigned_at", "id");
CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "order_id" UUID,
  "statement_id" UUID,
  "event_type" VARCHAR(40) NOT NULL,
  "channel" VARCHAR(10) NOT NULL DEFAULT 'email',
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "recipient_email" VARCHAR(255),
  "template_key" VARCHAR(100) NOT NULL,
  "template_version" INTEGER NOT NULL DEFAULT 1,
  "deduplication_key" VARCHAR(255) NOT NULL,
  "payload" JSONB NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
  "last_attempt_at" TIMESTAMPTZ(3),
  "lease_expires_at" TIMESTAMPTZ(3),
  "lease_token" UUID,
  "provider_message_id" VARCHAR(255),
  "failure_reason" VARCHAR(500),
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pk_notifications" PRIMARY KEY ("id"),
  CONSTRAINT "uq_notifications_deduplication_key" UNIQUE ("deduplication_key")
);
CREATE INDEX "ix_notifications_status_next_attempt_at" ON "notifications" ("status", "next_attempt_at");
CREATE INDEX "ix_notifications_created_at_id" ON "notifications" ("created_at", "id");
ALTER TABLE trips ADD CONSTRAINT fk_trips_order_company FOREIGN KEY(order_id,company_id) REFERENCES orders(id,company_id) ON DELETE RESTRICT;
ALTER TABLE trip_assignments ADD CONSTRAINT fk_trip_assignments_trip_id FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE RESTRICT;

ALTER TABLE orders ADD CONSTRAINT fk_orders_company_id FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

ALTER TABLE orders ADD CONSTRAINT fk_orders_created_by_user_id FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE orders ADD CONSTRAINT fk_orders_accepted_by_user_id FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE orders ADD CONSTRAINT fk_orders_rejected_by_user_id FOREIGN KEY (rejected_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE orders ADD CONSTRAINT fk_orders_eta_overridden_by_user_id FOREIGN KEY (eta_overridden_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE trips ADD CONSTRAINT fk_trips_company_id FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

ALTER TABLE trips ADD CONSTRAINT fk_trips_current_driver_id FOREIGN KEY (current_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT;

ALTER TABLE trips ADD CONSTRAINT fk_trips_expenses_confirmed_by_driver_id FOREIGN KEY (expenses_confirmed_by_driver_id) REFERENCES drivers(id) ON DELETE RESTRICT;

ALTER TABLE trips ADD CONSTRAINT fk_trips_eta_overridden_by_user_id FOREIGN KEY (eta_overridden_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE trip_assignments ADD CONSTRAINT fk_trip_assignments_driver_id FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT;

ALTER TABLE trip_assignments ADD CONSTRAINT fk_trip_assignments_assigned_by_user_id FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE notifications ADD CONSTRAINT fk_notifications_company_id FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE notifications ADD CONSTRAINT fk_notifications_order_id FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;

ALTER TABLE orders
 ADD CONSTRAINT ck_orders_version CHECK (version > 0),
 ADD CONSTRAINT ck_orders_coordinates CHECK (
  ((pickup_lat IS NULL AND pickup_lng IS NULL) OR (pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL AND pickup_lat BETWEEN -90 AND 90 AND pickup_lng BETWEEN -180 AND 180)) AND
  ((drop_lat IS NULL AND drop_lng IS NULL) OR (drop_lat IS NOT NULL AND drop_lng IS NOT NULL AND drop_lat BETWEEN -90 AND 90 AND drop_lng BETWEEN -180 AND 180))),
 ADD CONSTRAINT ck_orders_route CHECK (btrim(pickup_address) <> '' AND btrim(drop_address) <> '' AND btrim(contact_name) <> '' AND btrim(contact_phone) <> '' AND (route_distance_km IS NULL OR route_distance_km > 0)),
 ADD CONSTRAINT ck_orders_estimate CHECK (
  (estimated_duration_minutes IS NULL AND estimated_duration_source IS NULL AND estimate_average_speed_kmh IS NULL AND estimate_policy_version IS NULL AND eta_calculated_at IS NULL)
  OR (estimated_duration_minutes IS NOT NULL AND estimated_duration_minutes > 0 AND estimated_duration_source IS NOT NULL AND estimated_duration_source = 'distance_heuristic' AND route_distance_km IS NOT NULL AND route_distance_km > 0 AND estimate_average_speed_kmh IS NOT NULL AND estimate_average_speed_kmh > 0 AND estimate_policy_version IS NOT NULL AND btrim(estimate_policy_version) <> '' AND eta_calculated_at IS NOT NULL)),
 ADD CONSTRAINT ck_orders_override CHECK (admin_eta_minutes IS NULL OR admin_eta_minutes > 0);

ALTER TABLE trips
 ADD CONSTRAINT ck_trips_version CHECK (version > 0),
 ADD CONSTRAINT ck_trips_coordinates CHECK (
  ((pickup_lat IS NULL AND pickup_lng IS NULL) OR (pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL AND pickup_lat BETWEEN -90 AND 90 AND pickup_lng BETWEEN -180 AND 180)) AND
  ((drop_lat IS NULL AND drop_lng IS NULL) OR (drop_lat IS NOT NULL AND drop_lng IS NOT NULL AND drop_lat BETWEEN -90 AND 90 AND drop_lng BETWEEN -180 AND 180))),
 ADD CONSTRAINT ck_trips_route CHECK (btrim(pickup_address) <> '' AND btrim(drop_address) <> '' AND btrim(contact_name) <> '' AND btrim(contact_phone) <> '' AND (route_distance_km IS NULL OR route_distance_km > 0)),
 ADD CONSTRAINT ck_trips_estimate CHECK (
  (estimated_duration_minutes IS NULL AND estimated_duration_source IS NULL AND estimate_average_speed_kmh IS NULL AND estimate_policy_version IS NULL AND eta_calculated_at IS NULL)
  OR (estimated_duration_minutes IS NOT NULL AND estimated_duration_minutes > 0 AND estimated_duration_source IS NOT NULL AND estimated_duration_source = 'distance_heuristic' AND route_distance_km IS NOT NULL AND route_distance_km > 0 AND estimate_average_speed_kmh IS NOT NULL AND estimate_average_speed_kmh > 0 AND estimate_policy_version IS NOT NULL AND btrim(estimate_policy_version) <> '' AND eta_calculated_at IS NOT NULL)),
 ADD CONSTRAINT ck_trips_override CHECK (admin_eta_minutes IS NULL OR admin_eta_minutes > 0);

ALTER TABLE orders
 ADD CONSTRAINT ck_orders_source CHECK (source IN ('partner_portal','admin_phone','admin_whatsapp','admin_manual')),
 ADD CONSTRAINT ck_orders_state CHECK (
  (status = 'received' AND accepted_at IS NULL AND accepted_by_user_id IS NULL AND rejected_at IS NULL AND rejected_by_user_id IS NULL AND rejection_reason IS NULL) OR
  (status = 'accepted' AND accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL AND rejected_at IS NULL AND rejected_by_user_id IS NULL AND rejection_reason IS NULL) OR
  (status = 'rejected' AND rejected_at IS NOT NULL AND rejected_by_user_id IS NOT NULL AND rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '' AND accepted_at IS NULL AND accepted_by_user_id IS NULL));
ALTER TABLE trips
 ADD CONSTRAINT ck_trips_amount CHECK (total_amount >= 0 AND currency = 'INR'),
 ADD CONSTRAINT ck_trips_state CHECK (status IN ('unassigned','assigned','ongoing','closed') AND ((status = 'unassigned' AND current_driver_id IS NULL) OR (status <> 'unassigned' AND current_driver_id IS NOT NULL))),
 ADD CONSTRAINT ck_trips_code CHECK (otp_failed_attempts BETWEEN 0 AND 5 AND btrim(otp_hash) <> '' AND btrim(otp_encrypted_value) <> '' AND btrim(otp_key_id) <> '');
ALTER TABLE trip_assignments ADD CONSTRAINT ck_trip_assignments_state CHECK (status IN ('active','replaced','completed','cancelled') AND ((status = 'active' AND ended_at IS NULL) OR (status <> 'active' AND ended_at IS NOT NULL)));
CREATE UNIQUE INDEX uq_trip_assignments_active ON trip_assignments(trip_id) WHERE status = 'active';
ALTER TABLE notifications
 ADD CONSTRAINT ck_notifications_event CHECK (event_type IN ('order_accepted','order_rejected') AND order_id IS NOT NULL AND statement_id IS NULL AND channel = 'email'),
 ADD CONSTRAINT ck_notifications_state CHECK (status IN ('pending','processing','sent','failed') AND attempt_count BETWEEN 0 AND 5 AND (recipient_email IS NOT NULL OR (status = 'failed' AND failure_reason = 'RECIPIENT_MISSING'))),
 ADD CONSTRAINT ck_notifications_lease CHECK ((status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL));
-- Deferrable assertion permits acceptance + trip in either write order, but never
-- commits a terminal order without exactly one matching trip or a rejected trip.
CREATE FUNCTION enforce_order_trip_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; state text; trip_count integer;
BEGIN
 IF TG_TABLE_NAME = 'orders' THEN
  target := COALESCE(NEW.id, OLD.id);
 ELSE
  target := COALESCE(NEW.order_id, OLD.order_id);
 END IF;
 SELECT status INTO state FROM orders WHERE id = target;
 SELECT count(*) INTO trip_count FROM trips WHERE order_id = target;
 IF (state = 'accepted' AND trip_count <> 1) OR (state <> 'accepted' AND trip_count <> 0) THEN
  RAISE EXCEPTION 'order/trip state integrity violation' USING ERRCODE = '23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_orders_trip_integrity AFTER INSERT OR UPDATE OR DELETE ON orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_order_trip_integrity();
CREATE CONSTRAINT TRIGGER trg_trips_order_integrity AFTER INSERT OR UPDATE OR DELETE ON trips DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_order_trip_integrity();
