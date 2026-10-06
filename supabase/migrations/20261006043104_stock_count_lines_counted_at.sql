ALTER TABLE "stock_count_lines" ADD COLUMN "counted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD COLUMN "counted_by" uuid;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD COLUMN "adjustment" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "stock_counts" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_counted_by_profiles_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_counts_one_in_progress_key" ON "stock_counts" USING btree ("store_id") WHERE "stock_counts"."status" = 'in_progress';--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_counted_check" CHECK ("stock_count_lines"."counted_quantity" >= 0);--> statement-breakpoint
CREATE VIEW "public"."stock_count_line_books" WITH (security_invoker = true) AS (
    select
      l.stock_count_id,
      l.item_id,
      coalesce(sum(m.quantity) filter (where m.occurred_at <= l.counted_at), 0) as book_quantity
    from stock_count_lines l
    left join stock_movements m on m.item_id = l.item_id
    where l.counted_at is not null
    group by l.stock_count_id, l.item_id
  );