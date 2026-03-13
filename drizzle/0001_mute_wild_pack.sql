CREATE TABLE "search_policy_decisions" (
	"action_name" text NOT NULL,
	"context_bucket" text NOT NULL,
	"context_features" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"directive_text" text NOT NULL,
	"exploration_score" real DEFAULT 0 NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_family" text NOT NULL,
	"policy_version" text NOT NULL,
	"session_id" uuid NOT NULL,
	"stage" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_policy_rewards" (
	"finalized_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"outcome_label" text NOT NULL,
	"reward_breakdown" jsonb NOT NULL,
	"reward_value" real DEFAULT 0 NOT NULL,
	"session_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_policy_snapshots" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"offline_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parameters" jsonb NOT NULL,
	"policy_family" text NOT NULL,
	"status" text NOT NULL,
	"training_window_end" timestamp with time zone NOT NULL,
	"training_window_start" timestamp with time zone NOT NULL,
	"version" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "search_policy_rewards_session_id_idx" ON "search_policy_rewards" USING btree ("session_id");