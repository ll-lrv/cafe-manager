import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  pgView,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, quantity } from "./_shared";
import { itemUnits, items } from "./catalog";
import { stockCounts } from "./counts";
import { movementType } from "./enums";
import { purchaseOrderLines } from "./purchasing";
import { saleRecords } from "./sales";
import { profiles, stores } from "./stores";

/** 유통기한 관리용 로트. track_expiry 품목을 입고할 때 생성된다. */
export const stockLots = pgTable(
  "stock_lots",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    expiresOn: date("expires_on"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("stock_lots_item_expiry_idx").on(t.itemId, t.expiresOn)],
);

/**
 * 재고 입출고 원장. 현재 재고 = 품목별 quantity 합계.
 * 기록은 수정하거나 삭제하지 않는다. 잘못 입력한 경우 adjust 기록으로 바로잡는다.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    lotId: uuid("lot_id").references(() => stockLots.id, { onDelete: "restrict" }),
    type: movementType("type").notNull(),
    /** 기본 단위 기준, 부호 포함 (입고 +, 사용/판매/폐기 -) */
    quantity: quantity("quantity").notNull(),
    /** 입력할 때 사용한 단위와 수량 (화면 표시와 감사용) */
    enteredUnitId: uuid("entered_unit_id").references(() => itemUnits.id, {
      onDelete: "set null",
    }),
    enteredQuantity: quantity("entered_quantity"),
    /** 기본 단위 1개당 원가, 원(KRW). 입고 기록에만 사용 */
    unitCost: numeric("unit_cost", { precision: 14, scale: 4, mode: "number" }),
    memo: text("memo"),
    purchaseOrderLineId: uuid("purchase_order_line_id").references(
      () => purchaseOrderLines.id,
      { onDelete: "set null" },
    ),
    stockCountId: uuid("stock_count_id").references(() => stockCounts.id, {
      onDelete: "set null",
    }),
    saleRecordId: uuid("sale_record_id").references(() => saleRecords.id, {
      onDelete: "cascade",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_movements_store_item_idx").on(t.storeId, t.itemId, t.occurredAt),
    index("stock_movements_lot_idx").on(t.lotId),
    index("stock_movements_sale_idx").on(t.saleRecordId),
    check(
      "stock_movements_sign_check",
      sql`(${t.type} = 'receive' and ${t.quantity} > 0)
        or (${t.type} in ('consume', 'sale', 'waste') and ${t.quantity} < 0)
        or (${t.type} = 'adjust' and ${t.quantity} <> 0)`,
    ),
  ],
);

/** 품목별 현재 재고와 부족 여부 (보관 처리된 품목 제외) */
export const itemStockLevels = pgView("item_stock_levels", {
  itemId: uuid("item_id").notNull(),
  storeId: uuid("store_id").notNull(),
  quantity: quantity("quantity").notNull(),
  isLow: boolean("is_low").notNull(),
})
  .with({ securityInvoker: true })
  .as(sql`
    select
      i.id as item_id,
      i.store_id,
      coalesce(sum(m.quantity), 0) as quantity,
      coalesce(sum(m.quantity), 0) <= i.min_stock as is_low
    from items i
    left join stock_movements m on m.item_id = i.id
    where i.archived_at is null
    group by i.id
  `);

/** 유통기한 로트별 남은 수량 (남은 것만) */
export const lotStockLevels = pgView("lot_stock_levels", {
  lotId: uuid("lot_id").notNull(),
  itemId: uuid("item_id").notNull(),
  storeId: uuid("store_id").notNull(),
  expiresOn: date("expires_on"),
  quantity: quantity("quantity").notNull(),
})
  .with({ securityInvoker: true })
  .as(sql`
    select
      l.id as lot_id,
      l.item_id,
      l.store_id,
      l.expires_on,
      sum(m.quantity) as quantity
    from stock_lots l
    join stock_movements m on m.lot_id = l.id
    group by l.id
    having sum(m.quantity) > 0
  `);
