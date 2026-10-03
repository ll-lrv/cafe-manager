CREATE TABLE "store_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"token" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"email" text,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_invitations_role_check" CHECK ("store_invitations"."role" <> 'owner')
);
--> statement-breakpoint
ALTER TABLE "store_invitations" ADD CONSTRAINT "store_invitations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_invitations" ADD CONSTRAINT "store_invitations_accepted_by_profiles_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_invitations" ADD CONSTRAINT "store_invitations_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "store_invitations_token_key" ON "store_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "store_invitations_store_idx" ON "store_invitations" USING btree ("store_id");