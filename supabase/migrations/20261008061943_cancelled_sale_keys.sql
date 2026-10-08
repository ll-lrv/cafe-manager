CREATE TABLE "cancelled_sale_keys" (
	"store_id" uuid NOT NULL,
	"source" "sale_source" NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cancelled_sale_keys_store_id_source_external_id_pk" PRIMARY KEY("store_id","source","external_id")
);
--> statement-breakpoint
ALTER TABLE "cancelled_sale_keys" ADD CONSTRAINT "cancelled_sale_keys_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;