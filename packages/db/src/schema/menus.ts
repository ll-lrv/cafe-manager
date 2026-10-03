import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, createdAt, id, quantity, updatedAt } from "./_shared";
import { items } from "./catalog";
import { stores } from "./stores";

/** 판매 메뉴(아메리카노, 라떼 등). 나중에 POS 메뉴와 external_id 로 매칭한다. */
export const menus = pgTable(
  "menus",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 원(KRW) */
    price: integer("price").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    /** POS 등 외부 시스템의 메뉴 ID (연동 단계에서 사용) */
    externalId: text("external_id"),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("menus_store_name_key").on(t.storeId, t.name),
    check("menus_price_check", sql`${t.price} >= 0`),
  ],
);

/** 레시피: 메뉴 1개에 들어가는 재료와 수량(기본 단위) */
export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    quantity: quantity("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.menuId, t.itemId] }),
    check("recipe_ingredients_quantity_check", sql`${t.quantity} > 0`),
  ],
);
