import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, quantity } from "./_shared";
import { items } from "./catalog";
import { stockCountStatus } from "./enums";
import { profiles, stores } from "./stores";

/** 재고 실사. 완료하면 차이만큼 adjust 입출고 기록이 생성된다. */
export const stockCounts = pgTable(
  "stock_counts",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    status: stockCountStatus("status").notNull().default("in_progress"),
    memo: text("memo"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    completedBy: uuid("completed_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [index("stock_counts_store_idx").on(t.storeId, t.startedAt)],
);

export const stockCountLines = pgTable(
  "stock_count_lines",
  {
    stockCountId: uuid("stock_count_id")
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    /** 실사 시작 시점의 장부 재고 (기본 단위) */
    expectedQuantity: quantity("expected_quantity").notNull(),
    /** 실제로 센 수량. 아직 안 셌으면 null */
    countedQuantity: quantity("counted_quantity"),
  },
  (t) => [primaryKey({ columns: [t.stockCountId, t.itemId] })],
);
