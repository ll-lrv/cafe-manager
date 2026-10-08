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

/** 메뉴 옵션 규칙: scale 늘리기(배수), replace 바꾸기, add 추가 */
export const optionRuleKind = pgEnum("option_rule_kind", ["scale", "replace", "add"]);

/** CSV 옵션 열의 낱말을 어떻게 볼지: option 옵션으로, menu 메뉴 이름에 붙임(ICE 처럼 메뉴를 가르는 말), ignore 무시 */
export const optionAliasKind = pgEnum("option_alias_kind", ["option", "menu", "ignore"]);
