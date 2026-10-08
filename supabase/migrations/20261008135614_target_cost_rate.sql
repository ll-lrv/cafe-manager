ALTER TABLE "stores" ADD COLUMN "target_cost_rate" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "menus" ADD COLUMN "target_cost_rate" integer;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_target_cost_rate_check" CHECK ("stores"."target_cost_rate" BETWEEN 1 AND 100);--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_target_cost_rate_check" CHECK ("menus"."target_cost_rate" BETWEEN 1 AND 100);