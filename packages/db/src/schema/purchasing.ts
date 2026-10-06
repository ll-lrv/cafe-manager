import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, quantity, updatedAt } from "./_shared";
import { itemUnits, items, suppliers } from "./catalog";
import { purchaseOrderStatus } from "./enums";
import { profiles, stores } from "./stores";

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    status: purchaseOrderStatus("status").notNull().default("draft"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    expectedOn: date("expected_on"),
    memo: text("memo"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("purchase_orders_store_status_idx").on(t.storeId, t.status)],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: id(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    /** null 이면 기본 단위로 주문 */
    itemUnitId: uuid("item_unit_id").references(() => itemUnits.id, {
      onDelete: "restrict",
    }),
    /** 주문 단위 기준 수량 (예: 박스 3) */
    quantity: quantity("quantity").notNull(),
    /** 주문 단위 1개당 가격, 원(KRW) */
    unitPrice: integer("unit_price"),
    /** 지금까지 입고된 수량 (주문 단위 기준) */
    receivedQuantity: quantity("received_quantity").notNull().default(0),
  },
  (t) => [
    index("purchase_order_lines_po_idx").on(t.purchaseOrderId),
    /** 한 발주서에 같은 품목은 한 줄 (수량을 바꿔서 조정한다) */
    uniqueIndex("purchase_order_lines_po_item_key").on(t.purchaseOrderId, t.itemId),
    check("purchase_order_lines_quantity_check", sql`${t.quantity} > 0`),
    check("purchase_order_lines_received_check", sql`${t.receivedQuantity} >= 0`),
  ],
);
