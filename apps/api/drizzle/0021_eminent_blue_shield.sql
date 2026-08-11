ALTER TABLE "staged_rows" ADD COLUMN "suggestion_category_id" uuid;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "suggestion_confidence_bps" integer;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "suggestion_method" text;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "suggestion_evidence_count" integer;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "suggestion_algorithm_version" integer;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD CONSTRAINT "staged_rows_suggestion_category_id_categories_id_fk" FOREIGN KEY ("suggestion_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;