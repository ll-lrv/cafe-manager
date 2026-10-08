ALTER TABLE "menu_option_rules" DROP CONSTRAINT "menu_option_rules_shape_check";--> statement-breakpoint
ALTER TABLE "menu_option_rules" ADD CONSTRAINT "menu_option_rules_shape_check" CHECK (CASE "menu_option_rules"."kind"
        WHEN 'replace' THEN "menu_option_rules"."from_item_id" IS NOT NULL AND "menu_option_rules"."from_item_id" <> "menu_option_rules"."item_id" AND "menu_option_rules"."quantity" IS NULL
        ELSE "menu_option_rules"."from_item_id" IS NULL AND "menu_option_rules"."quantity" IS NOT NULL AND "menu_option_rules"."quantity" > 0
      END);