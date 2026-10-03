import { pgEnum } from "drizzle-orm/pg-core";

export const memberRole = pgEnum("member_role", ["owner", "manager", "staff"]);

/** 재고의 기본 단위. 입고 단위(박스, 봉지 등)는 item_units 로 환산한다. */
export const baseUnit = pgEnum("base_unit", ["g", "ml", "ea"]);

/**
 * receive: 입고(+)  consume: 매장 사용(-)  sale: 판매 차감(-)
 * waste: 폐기(-)    adjust: 실사/수동 조정(±)
 */
export const movementType = pgEnum("movement_type", [
  "receive",
  "consume",
  "sale",
  "waste",
  "adjust",
]);

export const purchaseOrderStatus = pgEnum("purchase_order_status", [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
]);

export const stockCountStatus = pgEnum("stock_count_status", [
  "in_progress",
  "completed",
  "cancelled",
]);

export const saleSource = pgEnum("sale_source", ["manual", "csv", "pos"]);
