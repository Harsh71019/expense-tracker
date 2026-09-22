CREATE TABLE "financial_safety_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"formula_version" integer NOT NULL,
	"policy_version" integer NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source_through" timestamp with time zone NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_safety_evaluations" ADD CONSTRAINT "financial_safety_evaluations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_safety_evaluations_identity_idx" ON "financial_safety_evaluations" USING btree ("user_id","input_fingerprint","formula_version","policy_version");--> statement-breakpoint
CREATE INDEX "financial_safety_evaluations_user_created_idx" ON "financial_safety_evaluations" USING btree ("user_id","created_at" DESC NULLS LAST);