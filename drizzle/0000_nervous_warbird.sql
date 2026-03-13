CREATE TABLE "result_events" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"feedback" text,
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"target" text NOT NULL,
	"target_rank" integer
);
--> statement-breakpoint
CREATE TABLE "search_candidates" (
	"confidence" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"query_text" text NOT NULL,
	"query_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rationale" text NOT NULL,
	"rank" integer NOT NULL,
	"session_id" uuid NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_sessions" (
	"confidence" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"provider_mode" text NOT NULL,
	"query_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_entity" text NOT NULL,
	"top_query" text NOT NULL,
	"user_text" text NOT NULL
);
