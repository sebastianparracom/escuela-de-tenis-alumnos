-- Reglas que la base de datos garantiza por sí misma (CA-15, RN-08).
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_overlap"
  EXCLUDE USING gist ("court_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" NOT IN ('cancelada', 'cancelada_cliente'));
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_profesor_overlap"
  EXCLUDE USING gist ("profesor_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("profesor_id" IS NOT NULL AND "status" NOT IN ('cancelada', 'cancelada_cliente'));
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_caddie_overlap"
  EXCLUDE USING gist ("caddie_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("caddie_id" IS NOT NULL AND "status" NOT IN ('cancelada', 'cancelada_cliente'));
--> statement-breakpoint
-- La API pública de Supabase no expone ninguna tabla: todo acceso pasa por el servidor.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "children" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "child_guardians" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "courts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "schedule_bands" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "holiday_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cancellation_reasons" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "price_lists" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "packages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "groups" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "group_schedule" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "group_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "group_class_participants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bag_movements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payroll_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "session_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_rentals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Datos con los que arranca la academia (CA-10, CA-33).
INSERT INTO "settings" ("id") VALUES (1);
--> statement-breakpoint
INSERT INTO "courts" ("name", "sort_order") VALUES
  ('Cancha 1', 1), ('Cancha 2', 2), ('Cancha 3', 3), ('Cancha 4', 4),
  ('Cancha 5', 5), ('Cancha 6', 6), ('Cancha 7', 7);
--> statement-breakpoint
INSERT INTO "cancellation_reasons" ("label", "sort_order") VALUES
  ('Lluvia', 1), ('Cancelación del alumno', 2), ('Cancelación del profesor', 3), ('Otro', 4);
