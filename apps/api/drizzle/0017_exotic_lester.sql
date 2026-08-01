DROP INDEX "categories_user_id_parent_id_name_unique";--> statement-breakpoint
DROP INDEX "categories_user_id_name_root_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_id_parent_id_name_unique" ON "categories" USING btree ("user_id","parent_id","name") WHERE "categories"."parent_id" IS NOT NULL AND "categories"."is_archived" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_id_name_root_unique" ON "categories" USING btree ("user_id","name") WHERE "categories"."parent_id" IS NULL AND "categories"."is_archived" = false;