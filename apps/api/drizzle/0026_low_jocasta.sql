CREATE TABLE "detected_recurring_stream_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" uuid NOT NULL,
	"detector_version" integer NOT NULL,
	"decision" text NOT NULL,
	"recurring_rule_id" uuid,
	"decided_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detected_recurring_stream_reviews" ADD CONSTRAINT "detected_recurring_stream_reviews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_recurring_stream_reviews" ADD CONSTRAINT "detected_recurring_stream_reviews_stream_id_detected_recurring_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."detected_recurring_streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_recurring_stream_reviews" ADD CONSTRAINT "detected_recurring_stream_reviews_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "detected_stream_reviews_user_stream_version" ON "detected_recurring_stream_reviews" USING btree ("user_id","stream_id","detector_version");--> statement-breakpoint
CREATE INDEX "detected_stream_reviews_user_decided" ON "detected_recurring_stream_reviews" USING btree ("user_id","decided_at" DESC NULLS LAST);