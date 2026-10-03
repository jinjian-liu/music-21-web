import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pieces = pgTable("pieces", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  author: text("author"),
  originalName: text("original_name").notNull(),
  objectKey: text("object_key").notNull(),
  scoreObjectKey: text("score_object_key"),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status").notNull().default("uploading"),
  parseStatus: text("parse_status").notNull().default("uploading"),
  publicationStatus: text("publication_status").notNull().default("private"),
  clientId: text("client_id"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  reviewReason: text("review_reason"),
  durationSeconds: integer("duration_seconds"),
  ppq: integer("ppq"),
  inferredKey: text("inferred_key"),
  trackCount: integer("track_count"),
  rightsSource: text("rights_source"),
  rightsExpiresAt: timestamp("rights_expires_at", { withTimezone: true }),
  rightsConfirmed: boolean("rights_confirmed").notNull().default(false),
  parseError: text("parse_error"),
  playCount: integer("play_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pieceTracks = pgTable("piece_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  pieceId: uuid("piece_id")
    .notNull()
    .references(() => pieces.id, { onDelete: "cascade" }),
  trackKey: text("track_key").notNull(),
  orderIndex: integer("order_index").notNull(),
  name: text("name").notNull(),
  channel: integer("channel").notNull(),
  program: integer("program").notNull(),
  instrument: text("instrument").notNull(),
  percussion: boolean("percussion").notNull(),
  noteCount: integer("note_count").notNull(),
  rangeLow: integer("range_low"),
  rangeHigh: integer("range_high"),
});

export const parseJobs = pgTable("parse_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  pieceId: uuid("piece_id")
    .notNull()
    .references(() => pieces.id, { onDelete: "cascade" })
    .unique(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  availableAt: timestamp("available_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockToken: uuid("lock_token"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  pieceId: uuid("piece_id")
    .notNull()
    .references(() => pieces.id, { onDelete: "cascade" }),
  reporterEmail: text("reporter_email").notNull(),
  reason: text("reason").notNull(),
  detail: text("detail"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const moderationEvents = pgTable("moderation_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  pieceId: uuid("piece_id")
    .notNull()
    .references(() => pieces.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: uuid("id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pieceId: text("piece_id").notNull(),
    title: text("title").notNull(),
    mode: text("mode").notNull(),
    targetTrackId: text("target_track_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    activeMs: integer("active_ms").notNull(),
    matched: integer("matched"),
    attempted: integer("attempted"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  audio: jsonb("audio").notNull(),
});

export const storageCleanup = pgTable("storage_cleanup", {
  id: uuid("id").primaryKey().defaultRandom(),
  pieceId: uuid("piece_id")
    .notNull()
    .unique()
    .references(() => pieces.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastError: text("last_error"),
});
