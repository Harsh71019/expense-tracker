CREATE TABLE "budget_alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"budget_id" uuid NOT NULL,
	"month" text NOT NULL,
	"policy_version" integer NOT NULL,
	"threshold_bps" integer NOT NULL,
	"spent_minor" bigint NOT NULL,
	"limit_minor" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "budget_alert_events_threshold_bps_positive" CHECK ("budget_alert_events"."threshold_bps" > 0),
	CONSTRAINT "budget_alert_events_policy_version_positive" CHECK ("budget_alert_events"."policy_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"limit_minor" bigint NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "budgets_limit_minor_positive" CHECK ("budgets"."limit_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "budget_alert_events" ADD CONSTRAINT "budget_alert_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_alert_events" ADD CONSTRAINT "budget_alert_events_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_alert_events_dedup_unique" ON "budget_alert_events" USING btree ("user_id","budget_id","month","policy_version","threshold_bps");--> statement-breakpoint
CREATE INDEX "budget_alert_events_user_id_month_created_at" ON "budget_alert_events" USING btree ("user_id","month","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_user_id_category_id_unique" ON "budgets" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "budgets_user_id_is_archived_created_at" ON "budgets" USING btree ("user_id","is_archived","created_at","id");