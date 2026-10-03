CREATE TYPE "public"."base_unit" AS ENUM('g', 'ml', 'ea');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('receive', 'consume', 'sale', 'waste', 'adjust');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'ordered', 'partially_received', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sale_source" AS ENUM('manual', 'csv', 'pos');--> statement-breakpoint
CREATE TYPE "public"."stock_count_status" AS ENUM('in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_members" (
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_members_store_id_user_id_pk" PRIMARY KEY("store_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Seoul' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"factor" numeric(14, 3) NOT NULL,
	"is_default_purchase" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_units_factor_check" CHECK ("item_units"."factor" > 0)
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"category_id" uuid,
	"default_supplier_id" uuid,
	"name" text NOT NULL,
	"barcode" text,
	"base_unit" "base_unit" NOT NULL,
	"min_stock" numeric(14, 3) DEFAULT 0 NOT NULL,
	"track_expiry" boolean DEFAULT false NOT NULL,
	"memo" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_min_stock_check" CHECK ("items"."min_stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"memo" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"external_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menus_price_check" CHECK ("menus"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"menu_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "recipe_ingredients_menu_id_item_id_pk" PRIMARY KEY("menu_id","item_id"),
	CONSTRAINT "recipe_ingredients_quantity_check" CHECK ("recipe_ingredients"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"item_unit_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" integer,
	"received_quantity" numeric(14, 3) DEFAULT 0 NOT NULL,
	CONSTRAINT "purchase_order_lines_quantity_check" CHECK ("purchase_order_lines"."quantity" > 0),
	CONSTRAINT "purchase_order_lines_received_check" CHECK ("purchase_order_lines"."received_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
	"ordered_at" timestamp with time zone,
	"expected_on" date,
	"memo" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"stock_count_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"expected_quantity" numeric(14, 3) NOT NULL,
	"counted_quantity" numeric(14, 3),
	CONSTRAINT "stock_count_lines_stock_count_id_item_id_pk" PRIMARY KEY("stock_count_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"status" "stock_count_status" DEFAULT 'in_progress' NOT NULL,
	"memo" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"amount" integer,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "sale_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_records_quantity_check" CHECK ("sale_records"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"expires_on" date,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"lot_id" uuid,
	"type" "movement_type" NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"entered_unit_id" uuid,
	"entered_quantity" numeric(14, 3),
	"unit_cost" numeric(14, 4),
	"memo" text,
	"purchase_order_line_id" uuid,
	"stock_count_id" uuid,
	"sale_record_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_sign_check" CHECK (("stock_movements"."type" = 'receive' and "stock_movements"."quantity" > 0)
        or ("stock_movements"."type" in ('consume', 'sale', 'waste') and "stock_movements"."quantity" < 0)
        or ("stock_movements"."type" = 'adjust' and "stock_movements"."quantity" <> 0))
);
--> statement-breakpoint
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_units" ADD CONSTRAINT "item_units_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_default_supplier_id_suppliers_id_fk" FOREIGN KEY ("default_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_unit_id_item_units_id_fk" FOREIGN KEY ("item_unit_id") REFERENCES "public"."item_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_completed_by_profiles_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_entered_unit_id_item_units_id_fk" FOREIGN KEY ("entered_unit_id") REFERENCES "public"."item_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_order_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("purchase_order_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_record_id_sale_records_id_fk" FOREIGN KEY ("sale_record_id") REFERENCES "public"."sale_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_store_name_key" ON "categories" USING btree ("store_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "item_units_item_name_key" ON "item_units" USING btree ("item_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "item_units_one_default_key" ON "item_units" USING btree ("item_id") WHERE "item_units"."is_default_purchase";--> statement-breakpoint
CREATE UNIQUE INDEX "items_store_name_key" ON "items" USING btree ("store_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "items_store_barcode_key" ON "items" USING btree ("store_id","barcode") WHERE "items"."barcode" is not null;--> statement-breakpoint
CREATE INDEX "suppliers_store_idx" ON "suppliers" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menus_store_name_key" ON "menus" USING btree ("store_id","name");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_po_idx" ON "purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_store_status_idx" ON "purchase_orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "stock_counts_store_idx" ON "stock_counts" USING btree ("store_id","started_at");--> statement-breakpoint
CREATE INDEX "sale_records_store_sold_idx" ON "sale_records" USING btree ("store_id","sold_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_records_external_key" ON "sale_records" USING btree ("store_id","source","external_id") WHERE "sale_records"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "stock_lots_item_expiry_idx" ON "stock_lots" USING btree ("item_id","expires_on");--> statement-breakpoint
CREATE INDEX "stock_movements_store_item_idx" ON "stock_movements" USING btree ("store_id","item_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movements_lot_idx" ON "stock_movements" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "stock_movements_sale_idx" ON "stock_movements" USING btree ("sale_record_id");--> statement-breakpoint
CREATE VIEW "public"."item_stock_levels" WITH (security_invoker = true) AS (
    select
      i.id as item_id,
      i.store_id,
      coalesce(sum(m.quantity), 0) as quantity,
      coalesce(sum(m.quantity), 0) <= i.min_stock as is_low
    from items i
    left join stock_movements m on m.item_id = i.id
    where i.archived_at is null
    group by i.id
  );--> statement-breakpoint
CREATE VIEW "public"."lot_stock_levels" WITH (security_invoker = true) AS (
    select
      l.id as lot_id,
      l.item_id,
      l.store_id,
      l.expires_on,
      sum(m.quantity) as quantity
    from stock_lots l
    join stock_movements m on m.lot_id = l.id
    group by l.id
    having sum(m.quantity) > 0
  );