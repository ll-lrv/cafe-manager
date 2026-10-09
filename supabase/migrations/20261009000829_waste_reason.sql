CREATE TYPE "public"."waste_reason" AS ENUM('expired', 'spoiled', 'mistake', 'damaged', 'other');--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "waste_reason" "waste_reason";--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_waste_reason_check" CHECK ("stock_movements"."waste_reason" is null or "stock_movements"."type" = 'waste');