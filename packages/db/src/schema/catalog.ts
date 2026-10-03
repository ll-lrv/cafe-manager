import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, createdAt, id, quantity, updatedAt } from "./_shared";
import { baseUnit } from "./enums";
import { stores } from "./stores";

export const categories = pgTable(
  "categories",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("categories_store_name_key").on(t.storeId, t.name)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    memo: text("memo"),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("suppliers_store_idx").on(t.storeId)],
);

/** 재고 품목(원두, 우유, 컵 등). 메뉴(menus)와는 구분된다. */
export const items = pgTable(
  "items",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    defaultSupplierId: uuid("default_supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    barcode: text("barcode"),
    baseUnit: baseUnit("base_unit").notNull(),
    /** 이 수량(기본 단위) 이하가 되면 부족 알림 */
    minStock: quantity("min_stock").notNull().default(0),
    /** true 면 입고 시 유통기한(로트)을 받고, 사용 시 유통기한이 빠른 로트부터 차감한다. */
    trackExpiry: boolean("track_expiry").notNull().default(false),
    memo: text("memo"),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("items_store_name_key").on(t.storeId, t.name),
    uniqueIndex("items_store_barcode_key")
      .on(t.storeId, t.barcode)
      .where(sql`${t.barcode} is not null`),
    check("items_min_stock_check", sql`${t.minStock} >= 0`),
  ],
);

/**
 * 입고/표시용 단위. 예) 원두 base_unit=g 일 때 { name: "봉(1kg)", factor: 1000 }
 * 우유 base_unit=ml 일 때 { name: "박스", factor: 10000 } (1L x 10)
 */
export const itemUnits = pgTable(
  "item_units",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 이 단위 1개 = 기본 단위 factor 만큼 */
    factor: quantity("factor").notNull(),
    isDefaultPurchase: boolean("is_default_purchase").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("item_units_item_name_key").on(t.itemId, t.name),
    uniqueIndex("item_units_one_default_key")
      .on(t.itemId)
      .where(sql`${t.isDefaultPurchase}`),
    check("item_units_factor_check", sql`${t.factor} > 0`),
  ],
);
