CREATE TYPE "public"."option_rule_kind" AS ENUM('scale', 'replace', 'add');--> statement-breakpoint
CREATE TABLE "menu_option_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" uuid NOT NULL,
	"kind" "option_rule_kind" NOT NULL,
	"item_id" uuid NOT NULL,
	"from_item_id" uuid,
	"quantity" numeric(14, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_option_rules_shape_check" CHECK (CASE "menu_option_rules"."kind"
        WHEN 'replace' THEN "menu_option_rules"."from_item_id" IS NOT NULL AND "menu_option_rules"."from_item_id" <> "menu_option_rules"."item_id" AND "menu_option_rules"."quantity" IS NULL
        ELSE "menu_option_rules"."from_item_id" IS NULL AND "menu_option_rules"."quantity" > 0
      END)
);
--> statement-breakpoint
CREATE TABLE "menu_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_options_price_check" CHECK ("menu_options"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_record_options" (
	"sale_record_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	CONSTRAINT "sale_record_options_sale_record_id_option_id_pk" PRIMARY KEY("sale_record_id","option_id")
);
--> statement-breakpoint
ALTER TABLE "menu_option_rules" ADD CONSTRAINT "menu_option_rules_option_id_menu_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."menu_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_option_rules" ADD CONSTRAINT "menu_option_rules_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_option_rules" ADD CONSTRAINT "menu_option_rules_from_item_id_items_id_fk" FOREIGN KEY ("from_item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_options" ADD CONSTRAINT "menu_options_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_record_options" ADD CONSTRAINT "sale_record_options_sale_record_id_sale_records_id_fk" FOREIGN KEY ("sale_record_id") REFERENCES "public"."sale_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_record_options" ADD CONSTRAINT "sale_record_options_option_id_menu_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."menu_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_option_rules_option_idx" ON "menu_option_rules" USING btree ("option_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_options_store_name_key" ON "menu_options" USING btree ("store_id","name");--> statement-breakpoint
CREATE INDEX "sale_record_options_option_idx" ON "sale_record_options" USING btree ("option_id");