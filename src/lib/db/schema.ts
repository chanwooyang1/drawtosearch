import {
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  PolicyRewardRecord,
  PolicySnapshot,
  SearchPolicyContext,
} from "@/lib/policy/types";

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

export const searchPolicyDecisions = pgTable("search_policy_decisions", {
  actionName: text("action_name").notNull(),
  contextBucket: text("context_bucket").notNull(),
  contextFeatures: jsonb("context_features")
    .$type<SearchPolicyContext>()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  directiveText: text("directive_text").notNull(),
  explorationScore: real("exploration_score").notNull().default(0),
  id: uuid("id").primaryKey(),
  policyFamily: text("policy_family").notNull(),
  policyVersion: text("policy_version").notNull(),
  sessionId: uuid("session_id").notNull(),
  stage: text("stage").notNull(),
});

export const searchPolicyRewards = pgTable(
  "search_policy_rewards",
  {
    finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull(),
    id: uuid("id").primaryKey(),
    outcomeLabel: text("outcome_label").notNull(),
    rewardBreakdown: jsonb("reward_breakdown")
      .$type<PolicyRewardRecord["rewardBreakdown"]>()
      .notNull(),
    rewardValue: real("reward_value").notNull().default(0),
    sessionId: uuid("session_id").notNull(),
  },
  (table) => ({
    sessionIdUnique: uniqueIndex("search_policy_rewards_session_id_idx").on(table.sessionId),
  }),
);

export const searchPolicySnapshots = pgTable("search_policy_snapshots", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  id: uuid("id").primaryKey(),
  offlineMetrics: jsonb("offline_metrics")
    .$type<PolicySnapshot["offlineMetrics"]>()
    .notNull()
    .default({}),
  parameters: jsonb("parameters")
    .$type<PolicySnapshot["parameters"]>()
    .notNull(),
  policyFamily: text("policy_family").notNull(),
  status: text("status").notNull(),
  trainingWindowEnd: timestamp("training_window_end", { withTimezone: true }).notNull(),
  trainingWindowStart: timestamp("training_window_start", { withTimezone: true }).notNull(),
  version: text("version").notNull(),
});
