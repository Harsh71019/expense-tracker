CREATE TYPE "public"."category_group" AS ENUM('essential', 'lifestyle');--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "group" "category_group";