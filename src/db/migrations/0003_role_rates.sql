ALTER TABLE "profiles" ADD COLUMN "profesor_rate" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "caddie_rate" integer;--> statement-breakpoint
-- El valor único anterior pasa a cada rol que la persona tenga.
UPDATE "profiles" p SET "profesor_rate" = p."session_rate"
  WHERE p."session_rate" IS NOT NULL AND EXISTS (SELECT 1 FROM "user_roles" r WHERE r."user_id" = p."id" AND r."role" = 'profesor');
--> statement-breakpoint
UPDATE "profiles" p SET "caddie_rate" = p."session_rate"
  WHERE p."session_rate" IS NOT NULL AND EXISTS (SELECT 1 FROM "user_roles" r WHERE r."user_id" = p."id" AND r."role" = 'caddie');
--> statement-breakpoint
-- RN-08: una persona no puede estar como profesor en una reserva y como caddie en otra a la misma hora,
-- ni ser caddie de su propia clase. (Los cruces profesor-profesor y caddie-caddie ya los impiden las exclusiones.)
CREATE OR REPLACE FUNCTION "bookings_person_overlap"() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('cancelada', 'cancelada_cliente') THEN
    RETURN NEW;
  END IF;
  IF NEW."profesor_id" IS NOT NULL AND NEW."profesor_id" = NEW."caddie_id" THEN
    RAISE EXCEPTION 'bookings_person_overlap: misma persona como profesor y caddie de la reserva' USING ERRCODE = '23P01';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "bookings" b
    WHERE b."id" <> NEW."id"
      AND b."status" NOT IN ('cancelada', 'cancelada_cliente')
      AND tstzrange(b."starts_at", b."ends_at", '[)') && tstzrange(NEW."starts_at", NEW."ends_at", '[)')
      AND ((NEW."caddie_id" IS NOT NULL AND b."profesor_id" = NEW."caddie_id")
        OR (NEW."profesor_id" IS NOT NULL AND b."caddie_id" = NEW."profesor_id"))
  ) THEN
    RAISE EXCEPTION 'bookings_person_overlap: la persona ya está en otra reserva a esa hora' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "bookings_person_overlap"
  BEFORE INSERT OR UPDATE OF "profesor_id", "caddie_id", "starts_at", "ends_at", "status" ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION "bookings_person_overlap"();
