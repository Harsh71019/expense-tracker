CREATE TYPE "public"."review_item_source_type" AS ENUM('category_suggestion', 'recurring_stream', 'recurring_change', 'spending_regime');--> statement-breakpoint
CREATE TYPE "public"."review_item_status" AS ENUM('active', 'dismissed', 'resolved', 'stale', 'superseded');--> statement-breakpoint
CREATE TABLE "review_inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_type" "review_item_source_type" NOT NULL,
	"source_id" text NOT NULL,
	"source_version" integer NOT NULL,
	"status" "review_item_status" DEFAULT 'active' NOT NULL,
	"priority_score" integer NOT NULL,
	"priority_factors" jsonb NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"amount_minor" bigint,
	"confidence_bps" integer NOT NULL,
	"evidence" jsonb NOT NULL,
	"input_watermark" jsonb NOT NULL,
	"supersedes_item_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"dismissed_at" timestamp with time zone,
	"dismiss_reason" text,
	"resolved_at" timestamp with time zone,
	"feedback_action" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_inbox_items" ADD CONSTRAINT "review_inbox_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_inbox_items" ADD CONSTRAINT "review_inbox_items_supersedes_item_id_review_inbox_items_id_fk" FOREIGN KEY ("supersedes_item_id") REFERENCES "public"."review_inbox_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_inbox_user_source_version" ON "review_inbox_items" USING btree ("user_id","source_type","source_id","source_version");--> statement-breakpoint
CREATE INDEX "review_inbox_user_status_priority_cursor" ON "review_inbox_items" USING btree ("user_id","status","priority_score" DESC NULLS LAST,"occurred_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "review_inbox_user_status_source" ON "review_inbox_items" USING btree ("user_id","status","source_type");--> statement-breakpoint
CREATE INDEX "review_inbox_user_supersedes" ON "review_inbox_items" USING btree ("user_id","supersedes_item_id");