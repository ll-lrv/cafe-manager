CREATE TYPE "public"."option_alias_kind" AS ENUM('option', 'menu', 'ignore');--> statement-breakpoint
CREATE TABLE "option_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"source_name" text NOT NULL,
	"kind" "option_alias_kind" NOT NULL,
	"option_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_aliases_source_name_check" CHECK (length("option_aliases"."source_name") BETWEEN 1 AND 100),
	CONSTRAINT "option_aliases_option_check" CHECK (("option_aliases"."kind" = 'option') = ("option_aliases"."option_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "option_aliases" ADD CONSTRAINT "option_aliases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_aliases" ADD CONSTRAINT "option_aliases_option_id_menu_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."menu_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "option_aliases_store_name_key" ON "option_aliases" USING btree ("store_id","source_name");