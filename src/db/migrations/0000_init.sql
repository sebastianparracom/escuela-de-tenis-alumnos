CREATE TYPE "public"."bag_kind" AS ENUM('individual', 'grupal');--> statement-breakpoint
CREATE TYPE "public"."bag_source" AS ENUM('pago', 'anulacion_pago', 'clase', 'correccion');--> statement-breakpoint
CREATE TYPE "public"."booking_kind" AS ENUM('individual', 'grupal', 'alquiler');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('agendada', 'dictada', 'cancelada', 'usado', 'no_usado', 'cancelada_cliente');--> statement-breakpoint
CREATE TYPE "public"."calendar" AS ENUM('entre_semana', 'fin_de_semana');--> statement-breakpoint
CREATE TYPE "public"."loose_type" AS ENUM('individual_diurna', 'individual_nocturna', 'grupal');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('clases', 'alquiler');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('efectivo', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('activo', 'anulado');--> statement-breakpoint
CREATE TYPE "public"."payroll_frequency" AS ENUM('semanal', 'quincenal', 'mensual');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'profesor', 'caddie', 'cliente');--> statement-breakpoint
CREATE TYPE "public"."session_role" AS ENUM('profesor', 'caddie');--> statement-breakpoint
CREATE TYPE "public"."session_source" AS ENUM('cierre', 'caddie_agregado', 'correccion');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"reason" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bag_movements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"bag" "bag_kind" NOT NULL,
	"delta" integer NOT NULL,
	"source" "bag_source" NOT NULL,
	"payment_id" uuid,
	"booking_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "booking_kind" NOT NULL,
	"court_id" integer NOT NULL,
	"local_date" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"turns" integer DEFAULT 1 NOT NULL,
	"night_turns" integer DEFAULT 0 NOT NULL,
	"status" "booking_status" DEFAULT 'agendada' NOT NULL,
	"profesor_id" uuid,
	"student_id" uuid,
	"group_id" integer,
	"client_id" uuid,
	"caddie_id" uuid,
	"cancel_reason_id" integer,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_by" uuid,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_range" CHECK ("bookings"."starts_at" < "bookings"."ends_at"),
	CONSTRAINT "bookings_kind_fields" CHECK (("bookings"."kind" = 'individual' and "bookings"."student_id" is not null and "bookings"."profesor_id" is not null)
       or ("bookings"."kind" = 'grupal' and "bookings"."group_id" is not null and "bookings"."profesor_id" is not null)
       or ("bookings"."kind" = 'alquiler' and "bookings"."client_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "cancellation_reasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_guardians" (
	"child_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	CONSTRAINT "child_guardians_child_id_client_id_pk" PRIMARY KEY("child_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"birth_date" date,
	"emergency_name" text DEFAULT '' NOT NULL,
	"emergency_phone" text DEFAULT '' NOT NULL,
	"notes" text,
	"photo_path" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_class_participants" (
	"booking_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	"present" boolean,
	CONSTRAINT "group_class_participants_booking_id_child_id_pk" PRIMARY KEY("booking_id","child_id")
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"child_id" uuid NOT NULL,
	"joined_on" date NOT NULL,
	"left_on" date
);
--> statement-breakpoint
CREATE TABLE "group_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"start_min" integer NOT NULL,
	"court_id" integer NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" varchar(5) NOT NULL,
	"profesor_id" uuid NOT NULL,
	"capacity" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holiday_overrides" (
	"date" date PRIMARY KEY NOT NULL,
	"is_holiday" boolean NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "bag_kind" NOT NULL,
	"class_count" integer NOT NULL,
	"price" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_min_classes" CHECK ("packages"."class_count" >= 4)
);
--> statement-breakpoint
CREATE TABLE "payment_rentals" (
	"payment_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	CONSTRAINT "payment_rentals_payment_id_booking_id_pk" PRIMARY KEY("payment_id","booking_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"payer_id" uuid NOT NULL,
	"student_id" uuid,
	"package_id" integer,
	"loose_type" "loose_type",
	"quantity" integer,
	"bag" "bag_kind",
	"classes" integer,
	"amount" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"status" "payment_status" DEFAULT 'activo' NOT NULL,
	"void_reason" text,
	"voided_by" uuid,
	"voided_at" timestamp with time zone,
	"created_by" uuid,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "session_role" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"sessions" integer NOT NULL,
	"rate" integer NOT NULL,
	"amount" integer NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_by" uuid
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"effective_from" date NOT NULL,
	"individual_day" integer NOT NULL,
	"individual_night" integer NOT NULL,
	"group_single" integer NOT NULL,
	"rental_day" integer NOT NULL,
	"rental_night" integer NOT NULL,
	"caddie_surcharge" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_lists_effective_from_unique" UNIQUE("effective_from")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"document" text,
	"photo_path" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"session_rate" integer,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "schedule_bands" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"calendar" "calendar" NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL,
	"turn_minutes" integer NOT NULL,
	"is_night" boolean NOT NULL,
	CONSTRAINT "band_turn_minutes" CHECK ("schedule_bands"."turn_minutes" in (45, 60)),
	CONSTRAINT "band_range" CHECK ("schedule_bands"."start_min" >= 0 and "schedule_bands"."end_min" <= 1439 and "schedule_bands"."start_min" < "schedule_bands"."end_min"),
	CONSTRAINT "band_exact" CHECK (("schedule_bands"."end_min" - "schedule_bands"."start_min") % "schedule_bands"."turn_minutes" = 0)
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"effective_from" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_effective_from_unique" UNIQUE("effective_from")
);
--> statement-breakpoint
CREATE TABLE "session_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "session_role" NOT NULL,
	"booking_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"work_date" date NOT NULL,
	"source" "session_source" NOT NULL,
	"payroll_item_id" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"school_name" text DEFAULT 'Escuela de Tenis' NOT NULL,
	"logo_path" text,
	"client_max_days" integer DEFAULT 14 NOT NULL,
	"staff_max_days" integer DEFAULT 90 NOT NULL,
	"client_max_turns" integer DEFAULT 3 NOT NULL,
	"payroll_frequency" "payroll_frequency" DEFAULT 'quincenal' NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid,
	"child_id" uuid,
	CONSTRAINT "students_profile_id_unique" UNIQUE("profile_id"),
	CONSTRAINT "students_child_id_unique" UNIQUE("child_id"),
	CONSTRAINT "students_one_owner" CHECK (num_nonnulls("students"."profile_id", "students"."child_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
ALTER TABLE "bag_movements" ADD CONSTRAINT "bag_movements_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_profesor_id_profiles_id_fk" FOREIGN KEY ("profesor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_caddie_id_profiles_id_fk" FOREIGN KEY ("caddie_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancel_reason_id_cancellation_reasons_id_fk" FOREIGN KEY ("cancel_reason_id") REFERENCES "public"."cancellation_reasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_guardians" ADD CONSTRAINT "child_guardians_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_guardians" ADD CONSTRAINT "child_guardians_client_id_profiles_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_class_participants" ADD CONSTRAINT "group_class_participants_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_class_participants" ADD CONSTRAINT "group_class_participants_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_schedule" ADD CONSTRAINT "group_schedule_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_schedule" ADD CONSTRAINT "group_schedule_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_profesor_id_profiles_id_fk" FOREIGN KEY ("profesor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_rentals" ADD CONSTRAINT "payment_rentals_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_rentals" ADD CONSTRAINT "payment_rentals_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_id_profiles_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_bands" ADD CONSTRAINT "schedule_bands_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_entries" ADD CONSTRAINT "session_entries_person_id_profiles_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_entries" ADD CONSTRAINT "session_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_entries" ADD CONSTRAINT "session_entries_payroll_item_id_payroll_items_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bag_movements_student_idx" ON "bag_movements" USING btree ("student_id","bag");--> statement-breakpoint
CREATE INDEX "bookings_local_date_idx" ON "bookings" USING btree ("local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_group_occurrence_uq" ON "bookings" USING btree ("group_id","starts_at") WHERE "bookings"."kind" = 'grupal';--> statement-breakpoint
CREATE INDEX "session_entries_person_idx" ON "session_entries" USING btree ("person_id","work_date");