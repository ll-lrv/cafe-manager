import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "./_shared";
import { saleSource } from "./enums";
import { menus } from "./menus";
import { profiles, stores } from "./stores";

/**
 * 판매 기록. MVP에서는 직접 입력(manual), 이후 CSV 업로드와 POS 연동으로 확장한다.
 * 기록 1건마다 레시피에 따라 sale 입출고 기록이 생성된다.
 */
export const saleRecords = pgTable(
  "sale_records",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    /** 판매 금액 합계, 원(KRW). POS 연동 시 할인 등이 반영된 실제 금액 */
    amount: integer("amount"),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull().defaultNow(),
    source: saleSource("source").notNull().default("manual"),
    /** 외부 시스템 주문 ID. 같은 주문이 중복으로 들어오는 것을 막는다. */
    externalId: text("external_id"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("sale_records_store_sold_idx").on(t.storeId, t.soldAt),
    uniqueIndex("sale_records_external_key")
      .on(t.storeId, t.source, t.externalId)
      .where(sql`${t.externalId} is not null`),
    check("sale_records_quantity_check", sql`${t.quantity} > 0`),
  ],
);
