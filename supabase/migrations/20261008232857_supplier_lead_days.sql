ALTER TABLE "suppliers" ADD COLUMN "lead_days" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "cover_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_lead_days_check" CHECK ("suppliers"."lead_days" between 0 and 60);--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_cover_days_check" CHECK ("suppliers"."cover_days" between 1 and 90);