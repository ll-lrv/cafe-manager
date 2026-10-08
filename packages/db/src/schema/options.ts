import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { archivedAt, createdAt, id, quantity, updatedAt } from "./_shared";
import { items } from "./catalog";
import { optionRuleKind } from "./enums";
import { saleRecords } from "./sales";
import { stores } from "./stores";

/**
 * 메뉴 옵션 (샷 추가, 오트밀크 변경, 사이즈업 등). 매장 단위로 만들고 어느 메뉴에나 붙일 수 있다.
 * 재료가 어떻게 바뀌는지는 menu_option_rules. 판매에 붙은 옵션은 sale_record_options.
 */
export const menuOptions = pgTable(
  "menu_options",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 추가 금액, 원(KRW). 판매 금액 = (메뉴 가격 + 옵션 금액) × 수량 */
    price: integer("price").notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("menu_options_store_name_key").on(t.storeId, t.name),
    check("menu_options_price_check", sql`${t.price} >= 0`),
  ],
);

/**
 * 옵션 하나가 레시피를 바꾸는 규칙. 판매 1개당, 기본 단위.
 * - scale: 레시피에 item 이 있으면 quantity 배 (사이즈업: 우유 ×1.3)
 * - replace: 레시피의 from_item 을 같은 양의 item 으로 (오트밀크 변경: 우유 → 오트밀크)
 * - add: item 을 quantity 만큼 더 (샷 추가: 원두 +18g)
 * 적용 순서: 늘리기 → 바꾸기 → 추가 (packages/core 의 applyOptions, DB 의 sale_ingredients)
 */
export const menuOptionRules = pgTable(
  "menu_option_rules",
  {
    id: id(),
    optionId: uuid("option_id")
      .notNull()
      .references(() => menuOptions.id, { onDelete: "cascade" }),
    kind: optionRuleKind("kind").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    fromItemId: uuid("from_item_id").references(() => items.id, { onDelete: "restrict" }),
    /** add: 더하는 양, scale: 배수. replace 는 null */
    quantity: quantity("quantity"),
    createdAt: createdAt(),
  },
  (t) => [
    index("menu_option_rules_option_idx").on(t.optionId),
    check(
      "menu_option_rules_shape_check",
      sql`CASE ${t.kind}
        WHEN 'replace' THEN ${t.fromItemId} IS NOT NULL AND ${t.fromItemId} <> ${t.itemId} AND ${t.quantity} IS NULL
        ELSE ${t.fromItemId} IS NULL AND ${t.quantity} IS NOT NULL AND ${t.quantity} > 0
      END`,
    ),
  ],
);

/** 판매에 붙은 옵션. 판매를 지우면 함께 지워진다. 기록은 판매 함수로만 */
export const saleRecordOptions = pgTable(
  "sale_record_options",
  {
    saleRecordId: uuid("sale_record_id")
      .notNull()
      .references(() => saleRecords.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => menuOptions.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.saleRecordId, t.optionId] }), index("sale_record_options_option_idx").on(t.optionId)],
);
