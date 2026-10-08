import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  pgView,
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
 * CSV 판매 가져오기 한 번. 가져오기를 취소하면(삭제) 그때 들어온 판매와 재료 차감이 함께 지워진다.
 */
export const saleImports = pgTable(
  "sale_imports",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("sale_imports_store_idx").on(t.storeId, t.createdAt)],
);

/**
 * 판매 파일(POS 내보내기)의 메뉴 이름 → 우리 메뉴. 다음 가져오기 때 자동으로 맞춘다.
 * menu_id 가 null 이면 "가져오지 않음" (예: 쿠폰, 재고와 상관없는 상품)
 */
export const menuAliases = pgTable(
  "menu_aliases",
  {
    id: id(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    sourceName: text("source_name").notNull(),
    menuId: uuid("menu_id").references(() => menus.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("menu_aliases_store_name_key").on(t.storeId, t.sourceName)],
);

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
    /** CSV 가져오기로 들어온 판매. 가져오기를 취소하면 함께 지워진다. */
    importId: uuid("import_id").references(() => saleImports.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("sale_records_import_idx").on(t.importId),
    index("sale_records_store_sold_idx").on(t.storeId, t.soldAt),
    uniqueIndex("sale_records_external_key")
      .on(t.storeId, t.source, t.externalId)
      .where(sql`${t.externalId} is not null`),
    check("sale_records_quantity_check", sql`${t.quantity} > 0`),
  ],
);

/** 가져오기마다 지금 남아 있는 판매 합계 (가져오기 기록 화면용) */
export const saleImportSummaries = pgView("sale_import_summaries", {
  importId: uuid("import_id").notNull(),
  storeId: uuid("store_id").notNull(),
  saleCount: integer("sale_count").notNull(),
  quantity: integer("quantity").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  firstSoldAt: timestamp("first_sold_at", { withTimezone: true }),
  lastSoldAt: timestamp("last_sold_at", { withTimezone: true }),
})
  .with({ securityInvoker: true })
  .as(sql`
    select
      i.id as import_id,
      i.store_id,
      count(s.id)::integer as sale_count,
      coalesce(sum(s.quantity), 0)::integer as quantity,
      coalesce(sum(s.amount), 0)::bigint as amount,
      min(s.sold_at) as first_sold_at,
      max(s.sold_at) as last_sold_at
    from sale_imports i
    left join sale_records s on s.import_id = i.id
    group by i.id
  `);
