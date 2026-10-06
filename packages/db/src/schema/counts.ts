import { sql } from "drizzle-orm";
import { check, index, pgTable, pgView, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, quantity } from "./_shared";
import { categories, items } from "./catalog";
import { stockCountStatus } from "./enums";
import { profiles, stores } from "./stores";

/**
 * 재고 실사. 완료하면 품목마다 "센 시각의 장부 재고"와의 차이만큼 adjust 입출고 기록이 생성된다.
 * 매장마다 진행 중인 실사는 하나만 둘 수 있다.
 */
export const stockCounts = pgTable(
  "stock_counts",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    status: stockCountStatus("status").notNull().default("in_progress"),
    /** 이 카테고리 품목만 센다. null 이면 전체 */
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    memo: text("memo"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    completedBy: uuid("completed_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_counts_store_idx").on(t.storeId, t.startedAt),
    uniqueIndex("stock_counts_one_in_progress_key")
      .on(t.storeId)
      .where(sql`${t.status} = 'in_progress'`),
  ],
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
    /** 센 시각. 이 시각의 장부와 비교해 조정한다. (DB 트리거가 기록) */
    countedAt: timestamp("counted_at", { withTimezone: true }),
    countedBy: uuid("counted_by").references(() => profiles.id, { onDelete: "set null" }),
    /** 완료할 때 적용된 조정량 (기본 단위, 부호 포함). 차이가 없으면 0, 세지 않았으면 null */
    adjustment: quantity("adjustment"),
  },
  (t) => [
    primaryKey({ columns: [t.stockCountId, t.itemId] }),
    check("stock_count_lines_counted_check", sql`${t.countedQuantity} >= 0`),
  ],
);

/** 실사 줄마다 "센 시각의 장부 재고". 센 뒤에 생긴 입출고·판매는 빼고 비교하기 위해 쓴다. */
export const stockCountLineBooks = pgView("stock_count_line_books", {
  stockCountId: uuid("stock_count_id").notNull(),
  itemId: uuid("item_id").notNull(),
  bookQuantity: quantity("book_quantity").notNull(),
})
  .with({ securityInvoker: true })
  .as(sql`
    select
      l.stock_count_id,
      l.item_id,
      coalesce(sum(m.quantity) filter (where m.occurred_at <= l.counted_at), 0) as book_quantity
    from stock_count_lines l
    left join stock_movements m on m.item_id = l.item_id
    where l.counted_at is not null
    group by l.stock_count_id, l.item_id
  `);
