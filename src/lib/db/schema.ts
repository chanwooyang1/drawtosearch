import {
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const searchSessions = pgTable("search_sessions", {
  confidence: real("confidence").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  id: uuid("id").primaryKey(),
  locale: text("locale").notNull(),
  providerMode: text("provider_mode").notNull(),
  queryVariants: jsonb("query_variants").$type<string[]>().notNull().default([]),
  topEntity: text("top_entity").notNull(),
  topQuery: text("top_query").notNull(),
  userText: text("user_text").notNull(),
});

export const searchCandidates = pgTable("search_candidates", {
  confidence: real("confidence").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  id: uuid("id").primaryKey(),
  label: text("label").notNull(),
  queryText: text("query_text").notNull(),
  queryVariants: jsonb("query_variants").$type<string[]>().notNull().default([]),
  rationale: text("rationale").notNull(),
  rank: integer("rank").notNull(),
  sessionId: uuid("session_id").notNull(),
  source: text("source").notNull(),
});

export const resultEvents = pgTable("result_events", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  eventType: text("event_type").notNull(),
  feedback: text("feedback"),
  id: uuid("id").primaryKey(),
  sessionId: uuid("session_id").notNull(),
  target: text("target").notNull(),
  targetRank: integer("target_rank"),
});
