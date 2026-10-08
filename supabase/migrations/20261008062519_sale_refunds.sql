ALTER TABLE "sale_records" DROP CONSTRAINT "sale_records_quantity_check";--> statement-breakpoint
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_sign_check";--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_quantity_check" CHECK ("sale_records"."quantity" <> 0);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sign_check" CHECK (("stock_movements"."type" = 'receive' and "stock_movements"."quantity" > 0)
        or ("stock_movements"."type" in ('consume', 'waste') and "stock_movements"."quantity" < 0)
        or ("stock_movements"."type" = 'sale' and "stock_movements"."quantity" <> 0)
        or ("stock_movements"."type" = 'adjust' and "stock_movements"."quantity" <> 0));