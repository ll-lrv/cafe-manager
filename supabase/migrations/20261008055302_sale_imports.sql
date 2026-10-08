CREATE TABLE "menu_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"source_name" text NOT NULL,
	"menu_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale_records" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "menu_aliases" ADD CONSTRAINT "menu_aliases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_aliases" ADD CONSTRAINT "menu_aliases_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_imports" ADD CONSTRAINT "sale_imports_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_imports" ADD CONSTRAINT "sale_imports_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_aliases_store_name_key" ON "menu_aliases" USING btree ("store_id","source_name");--> statement-breakpoint
CREATE INDEX "sale_imports_store_idx" ON "sale_imports" USING btree ("store_id","created_at");--> statement-breakpoint
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_import_id_sale_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."sale_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_records_import_idx" ON "sale_records" USING btree ("import_id");