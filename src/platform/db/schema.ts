import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AccentPalette, DomainRecord, RecordData, RecordKind, Role } from "@/shared/contracts";
import type { DocumentFormat, DocumentMetadata } from "@/modules/documents/contracts";
import type { WorkingTimeSettings } from "@/shared/working-time";
export const user = pgTable("app_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const profilePreferences = pgTable("profile_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  accentPalette: text("accent_palette").$type<AccentPalette>().notNull().default("green"),
  onboardingVersion: integer("onboarding_version").notNull().default(0),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  workingTime: jsonb("working_time").$type<WorkingTimeSettings>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscription_scope_user_idx").on(t.departmentId, t.userId)],
);
export const session = pgTable(
  "app_session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);
export const account = pgTable(
  "app_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);
export const verification = pgTable(
  "app_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
export const rateLimit = pgTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});
export const departments = pgTable(
  "departments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("department_organization_idx").on(t.id, t.organizationId)],
);
export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    role: text("role").$type<Role>().notNull().default("user"),
    status: text("status").$type<"pending" | "active" | "disabled">().notNull().default("pending"),
  },
  (t) => [
    uniqueIndex("membership_user_department_idx").on(t.userId, t.departmentId),
    foreignKey({
      columns: [t.departmentId, t.organizationId],
      foreignColumns: [departments.id, departments.organizationId],
      name: "membership_department_scope_fk",
    }),
  ],
);
export const records = pgTable(
  "records",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<RecordKind>().notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    productionId: text("production_id"),
    ownerId: text("owner_id").references(() => user.id),
    parentId: text("parent_id"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    data: jsonb("data").$type<RecordData>().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("record_scope_kind_idx").on(t.departmentId, t.kind),
    index("record_production_idx").on(t.departmentId, t.productionId, t.kind),
    index("record_owner_time_idx").on(t.departmentId, t.ownerId, t.kind, t.startAt),
    index("record_chat_idx").on(t.departmentId, t.kind, t.productionId, t.createdAt),
    foreignKey({
      columns: [t.departmentId, t.organizationId],
      foreignColumns: [departments.id, departments.organizationId],
      name: "record_department_scope_fk",
    }),
    uniqueIndex("time_idempotency_idx")
      .on(t.departmentId, t.ownerId, sql`(${t.data}->>'idempotencyKey')`)
      .where(sql`${t.kind}='time' and coalesce(${t.data}->>'idempotencyKey','')<>''`),
    uniqueIndex("timesheet_week_idx")
      .on(t.departmentId, t.ownerId, sql`(${t.data}->>'week')`)
      .where(sql`${t.kind}='timesheets'`),
    uniqueIndex("attendance_idempotency_idx")
      .on(t.departmentId, t.ownerId, sql`(${t.data}->>'idempotencyKey')`)
      .where(sql`${t.kind}='attendance' and coalesce(${t.data}->>'idempotencyKey','')<>''`),
    uniqueIndex("calendar_category_key_idx")
      .on(t.departmentId, sql`(${t.data}->>'key')`)
      .where(sql`${t.kind}='calendarCategories'`),
    uniqueIndex("domain_category_key_idx")
      .on(t.departmentId, sql`(${t.data}->>'scope')`, sql`(${t.data}->>'key')`)
      .where(sql`${t.kind}='categories'`),
    uniqueIndex("direct_chat_key_idx")
      .on(t.departmentId, sql`(${t.data}->>'directKey')`)
      .where(sql`${t.kind}='conversations' and coalesce(${t.data}->>'directKey','')<>''`),
    index("private_chat_messages_idx")
      .on(t.departmentId, sql`(${t.data}->>'conversationId')`, t.updatedAt)
      .where(sql`${t.kind}='messages' and coalesce(${t.data}->>'conversationId','')<>''`),
  ],
);
export const timers = pgTable("timers", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id)
    .unique(),
  departmentId: text("department_id")
    .notNull()
    .references(() => departments.id),
  data: jsonb("data").$type<RecordData>().notNull(),
});
export const attendanceTimers = pgTable("attendance_timers", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  departmentId: text("department_id")
    .notNull()
    .references(() => departments.id),
  data: jsonb("data").$type<RecordData>().notNull(),
});
export const outbox = pgTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<RecordData>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    status: text("status").notNull().default("pending"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbox_pending_idx").on(t.status, t.availableAt)],
);
export const audit = pgTable("audit", {
  id: text("id").primaryKey(),
  departmentId: text("department_id")
    .notNull()
    .references(() => departments.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  action: text("action").notNull(),
  recordId: text("record_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
/** Bounded change history and short-lived undo receipts; deleted records have no cascading FK. */
export const recordOperations = pgTable(
  "record_operations",
  {
    id: text("id").primaryKey(),
    departmentId: text("department_id")
      .notNull()
      .references(() => departments.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    recordId: text("record_id").notNull(),
    kind: text("kind").$type<RecordKind>().notNull(),
    operation: text("operation").$type<"created" | "updated" | "deleted" | "undone">().notNull(),
    before: jsonb("before_data").$type<DomainRecord>(),
    after: jsonb("after_data").$type<DomainRecord>(),
    undoPayload: jsonb("undo_payload").$type<RecordData>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("record_operations_scope_time_idx").on(t.departmentId, t.createdAt),
    index("record_operations_record_idx").on(t.departmentId, t.recordId, t.createdAt),
    index("record_operations_expiry_idx")
      .on(t.expiresAt)
      .where(sql`${t.undoPayload} is not null`),
  ],
);
export const calendarTokens = pgTable("calendar_tokens", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  departmentId: text("department_id")
    .notNull()
    .references(() => departments.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const recordHistory = pgTable(
  "record_history",
  {
    id: text("id").primaryKey(),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    data: jsonb("data").$type<RecordData>().notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("record_history_version_idx").on(t.recordId, t.version)],
);
/** Document bodies are excluded from workspace lists and their shared cache. */
export const collaborativeDocuments = pgTable("collaborative_documents", {
  fileId: text("file_id")
    .primaryKey()
    .references(() => records.id, { onDelete: "cascade" }),
  format: text("format").$type<DocumentFormat>().notNull(),
  metadata: jsonb("metadata").$type<DocumentMetadata>().notNull(),
  state: text("state").notNull(),
  checkpointRevision: integer("checkpoint_revision").notNull().default(0),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => user.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
