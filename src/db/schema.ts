import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const roleEnum = pgEnum("role", ["admin", "profesor", "caddie", "cliente"]);
export const calendarEnum = pgEnum("calendar", ["entre_semana", "fin_de_semana"]);
export const bagKindEnum = pgEnum("bag_kind", ["individual", "grupal"]);
export const bookingKindEnum = pgEnum("booking_kind", ["individual", "grupal", "alquiler"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "agendada", // clase o alquiler reservado, sin cerrar
  "dictada", // clase cerrada como dictada
  "cancelada", // clase cancelada con motivo
  "usado", // alquiler cerrado como usado
  "no_usado", // alquiler cerrado como no usado, con motivo
  "cancelada_cliente", // alquiler cancelado antes de su hora
]);
export const payrollFrequencyEnum = pgEnum("payroll_frequency", ["semanal", "quincenal", "mensual"]);
export const bagSourceEnum = pgEnum("bag_source", ["pago", "anulacion_pago", "clase", "correccion"]);
export const sessionRoleEnum = pgEnum("session_role", ["profesor", "caddie"]);
export const sessionSourceEnum = pgEnum("session_source", ["cierre", "caddie_agregado", "correccion"]);
export const paymentKindEnum = pgEnum("payment_kind", ["clases", "alquiler"]);
export const looseTypeEnum = pgEnum("loose_type", ["individual_diurna", "individual_nocturna", "grupal"]);
export const paymentMethodEnum = pgEnum("payment_method", ["efectivo", "transferencia"]);
export const paymentStatusEnum = pgEnum("payment_status", ["activo", "anulado"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- Personas ----------

/** Un usuario con acceso. `id` es el mismo id del usuario en Supabase Auth. */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().default(""),
  document: text("document"),
  photoPath: text("photo_path"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  /** Valor por sesión en COP cuando trabaja como profesor (CA-50, D-43). */
  profesorRate: integer("profesor_rate"),
  /** Valor por sesión en COP cuando trabaja como caddie (CA-50, D-43). */
  caddieRate: integer("caddie_rate"),
  isTest: boolean("is_test").notNull().default(false),
  createdAt: createdAt(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const children = pgTable("children", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  birthDate: date("birth_date"),
  emergencyName: text("emergency_name").notNull().default(""),
  emergencyPhone: text("emergency_phone").notNull().default(""),
  notes: text("notes"),
  photoPath: text("photo_path"),
  isActive: boolean("is_active").notNull().default(true),
  isTest: boolean("is_test").notNull().default(false),
  createdAt: createdAt(),
});

export const childGuardians = pgTable(
  "child_guardians",
  {
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.childId, t.clientId] })],
);

/** Alumno: un cliente o un niño a cargo. Las bolsas y las clases individuales cuelgan de aquí. */
export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .unique()
      .references(() => profiles.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .unique()
      .references(() => children.id, { onDelete: "cascade" }),
  },
  (t) => [check("students_one_owner", sql`num_nonnulls(${t.profileId}, ${t.childId}) = 1`)],
);

// ---------- Configuración ----------

export const settings = pgTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    schoolName: text("school_name").notNull().default("Escuela de Tenis"),
    logoPath: text("logo_path"),
    clientMaxDays: integer("client_max_days").notNull().default(14),
    staffMaxDays: integer("staff_max_days").notNull().default(90),
    clientMaxTurns: integer("client_max_turns").notNull().default(3),
    payrollFrequency: payrollFrequencyEnum("payroll_frequency").notNull().default("quincenal"),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);

export const courts = pgTable("courts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Versión de franjas vigente desde una fecha (CA-11, CA-12). */
export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  effectiveFrom: date("effective_from").notNull().unique(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const scheduleBands = pgTable(
  "schedule_bands",
  {
    id: serial("id").primaryKey(),
    scheduleId: integer("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    calendar: calendarEnum("calendar").notNull(),
    startMin: integer("start_min").notNull(),
    endMin: integer("end_min").notNull(),
    turnMinutes: integer("turn_minutes").notNull(),
    isNight: boolean("is_night").notNull(),
  },
  (t) => [
    check("band_turn_minutes", sql`${t.turnMinutes} in (45, 60)`),
    check("band_range", sql`${t.startMin} >= 0 and ${t.endMin} <= 1439 and ${t.startMin} < ${t.endMin}`),
    check("band_exact", sql`(${t.endMin} - ${t.startMin}) % ${t.turnMinutes} = 0`),
  ],
);

/** Ajustes manuales a los festivos calculados (D-07). */
export const holidayOverrides = pgTable("holiday_overrides", {
  date: date("date").primaryKey(),
  isHoliday: boolean("is_holiday").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const cancellationReasons = pgTable("cancellation_reasons", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** Tarifas vigentes desde una fecha (CA-20, D-29). */
export const priceLists = pgTable("price_lists", {
  id: serial("id").primaryKey(),
  effectiveFrom: date("effective_from").notNull().unique(),
  individualDay: integer("individual_day").notNull(),
  individualNight: integer("individual_night").notNull(),
  groupSingle: integer("group_single").notNull(),
  rentalDay: integer("rental_day").notNull(),
  rentalNight: integer("rental_night").notNull(),
  caddieSurcharge: integer("caddie_surcharge").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const packages = pgTable(
  "packages",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    kind: bagKindEnum("kind").notNull(),
    classCount: integer("class_count").notNull(),
    price: integer("price").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check("package_min_classes", sql`${t.classCount} >= 4`)],
);

// ---------- Grupos ----------

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: varchar("code", { length: 5 }).notNull(),
  profesorId: uuid("profesor_id")
    .notNull()
    .references(() => profiles.id),
  capacity: integer("capacity"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  isTest: boolean("is_test").notNull().default(false),
  createdAt: createdAt(),
});

/** Horario de un grupo por día de la semana, vigente en [valid_from, valid_to) (D-17, D-18). */
export const groupSchedule = pgTable("group_schedule", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  /** 1 = lunes … 7 = domingo */
  weekday: integer("weekday").notNull(),
  startMin: integer("start_min").notNull(),
  courtId: integer("court_id")
    .notNull()
    .references(() => courts.id),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
});

export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  childId: uuid("child_id")
    .notNull()
    .references(() => children.id),
  joinedOn: date("joined_on").notNull(),
  leftOn: date("left_on"),
});

// ---------- Reservas ----------

/**
 * Toda ocupación de un turno: clase individual, clase de grupo o alquiler.
 * Las restricciones de exclusión (migración a mano) impiden cruces de cancha, profesor y caddie.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: bookingKindEnum("kind").notNull(),
    courtId: integer("court_id")
      .notNull()
      .references(() => courts.id),
    localDate: date("local_date").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    turns: integer("turns").notNull().default(1),
    nightTurns: integer("night_turns").notNull().default(0),
    status: bookingStatusEnum("status").notNull().default("agendada"),
    profesorId: uuid("profesor_id").references(() => profiles.id),
    studentId: uuid("student_id").references(() => students.id),
    groupId: integer("group_id").references(() => groups.id),
    clientId: uuid("client_id").references(() => profiles.id),
    caddieId: uuid("caddie_id").references(() => profiles.id),
    cancelReasonId: integer("cancel_reason_id").references(() => cancellationReasons.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by"),
    createdBy: uuid("created_by"),
    isTest: boolean("is_test").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("bookings_local_date_idx").on(t.localDate),
    uniqueIndex("bookings_group_occurrence_uq")
      .on(t.groupId, t.startsAt)
      .where(sql`${t.kind} = 'grupal'`),
    check("bookings_range", sql`${t.startsAt} < ${t.endsAt}`),
    check(
      "bookings_kind_fields",
      sql`(${t.kind} = 'individual' and ${t.studentId} is not null and ${t.profesorId} is not null)
       or (${t.kind} = 'grupal' and ${t.groupId} is not null and ${t.profesorId} is not null)
       or (${t.kind} = 'alquiler' and ${t.clientId} is not null)`,
    ),
  ],
);

/** Asistencia de una clase de grupo: inscritos al cerrar + invitados (D-21). */
export const groupClassParticipants = pgTable(
  "group_class_participants",
  {
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id),
    isGuest: boolean("is_guest").notNull().default(false),
    present: boolean("present"),
  },
  (t) => [primaryKey({ columns: [t.bookingId, t.childId] })],
);

// ---------- Libros de movimientos ----------

/** Saldo de bolsa = suma de deltas (RN-14: nada se edita ni se borra). */
export const bagMovements = pgTable(
  "bag_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    bag: bagKindEnum("bag").notNull(),
    delta: integer("delta").notNull(),
    source: bagSourceEnum("source").notNull(),
    paymentId: uuid("payment_id"),
    bookingId: uuid("booking_id"),
    note: text("note"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("bag_movements_student_idx").on(t.studentId, t.bag)],
);

export const payrollItems = pgTable("payroll_items", {
  id: serial("id").primaryKey(),
  personId: uuid("person_id")
    .notNull()
    .references(() => profiles.id),
  role: sessionRoleEnum("role").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  sessions: integer("sessions").notNull(),
  rate: integer("rate").notNull(),
  amount: integer("amount").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  paidBy: uuid("paid_by"),
});

/** Sesiones de profesores y caddies (CA-32, CA-35, CA-36, CA-51). */
export const sessionEntries = pgTable(
  "session_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => profiles.id),
    role: sessionRoleEnum("role").notNull(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    delta: integer("delta").notNull(),
    workDate: date("work_date").notNull(),
    source: sessionSourceEnum("source").notNull(),
    payrollItemId: integer("payroll_item_id").references(() => payrollItems.id),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("session_entries_person_idx").on(t.personId, t.workDate)],
);

// ---------- Pagos ----------

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: paymentKindEnum("kind").notNull(),
  payerId: uuid("payer_id")
    .notNull()
    .references(() => profiles.id),
  studentId: uuid("student_id").references(() => students.id),
  packageId: integer("package_id").references(() => packages.id),
  looseType: looseTypeEnum("loose_type"),
  quantity: integer("quantity"),
  bag: bagKindEnum("bag"),
  classes: integer("classes"),
  amount: integer("amount").notNull(),
  method: paymentMethodEnum("method").notNull(),
  paidOn: date("paid_on").notNull(),
  reference: text("reference"),
  status: paymentStatusEnum("status").notNull().default("activo"),
  voidReason: text("void_reason"),
  voidedBy: uuid("voided_by"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdBy: uuid("created_by"),
  isTest: boolean("is_test").notNull().default(false),
  createdAt: createdAt(),
});

/** Un pago de alquiler cubre completo uno o varios alquileres (D-28). */
export const paymentRentals = pgTable(
  "payment_rentals",
  {
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    amount: integer("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.paymentId, t.bookingId] })],
);

// ---------- Auditoría ----------

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  reason: text("reason"),
  data: jsonb("data"),
  createdAt: createdAt(),
});
