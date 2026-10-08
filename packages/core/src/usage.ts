import { suggestOrderQuantity } from "./purchasing";
import { roundQty } from "./quantity";
import { stockStatus } from "./stock-status";

/** 하루 평균 사용량을 구할 때 보는 기간 (오늘을 뺀 지난 날 수) */
export const USAGE_WINDOW_DAYS = 14;
/** 판매·사용 기록이 이 날 수보다 짧으면 평균을 내지 않는다 (하루 이틀로는 들쭉날쭉해서) */
export const MIN_USAGE_DAYS = 3;
/** 이 날 수 안에 떨어질 품목을 "곧 소진"으로 보여준다 (대시보드·품목 목록) */
export const RUNOUT_SOON_DAYS = 7;
/** 거래처에 정하지 않았을 때: 발주하고 입고까지 걸리는 날 */
export const DEFAULT_LEAD_DAYS = 1;
/** 거래처에 정하지 않았을 때: 한 번 발주로 버틸 날 (다음 발주까지) */
export const DEFAULT_COVER_DAYS = 7;

export interface DailyUsage {
  /** 하루 평균 사용량 (기본 단위) */
  perDay: number;
  /** 평균을 낸 날 수 (MIN_USAGE_DAYS ~ USAGE_WINDOW_DAYS) */
  days: number;
}

function utcDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * 하루 평균 사용량. 판매·사용(consume)으로 나간 양만 본다 (폐기·조정은 들쭉날쭉해서 뺀다).
 * used: 오늘을 뺀 최근 USAGE_WINDOW_DAYS 일 동안 나간 양 (양수, 반품은 상계)
 * firstUsedOn: 처음 판매·사용 기록이 있는 날 (매장 시간대 YYYY-MM-DD). 그보다 앞의 날은 평균에 넣지 않는다.
 * 기록이 MIN_USAGE_DAYS 일보다 짧거나 쓴 양이 없으면 null.
 * 예) 최근 14일 원두 2,800g → 하루 200g
 */
export function dailyUsage(used: number, firstUsedOn: string | null, today: string): DailyUsage | null {
  if (!firstUsedOn || used <= 0) return null;
  const days = Math.min(USAGE_WINDOW_DAYS, Math.round((utcDay(today) - utcDay(firstUsedOn)) / 86_400_000));
  if (days < MIN_USAGE_DAYS) return null;
  return { perDay: roundQty(used / days), days };
}

/** 지금 재고로 버틸 날 (하루 평균 기준, 내림). 재고가 없으면 0 */
export function daysUntilEmpty(current: number, perDay: number): number {
  if (current <= 0) return 0;
  return Math.floor(roundQty(current / perDay));
}

/** 소진 예상 표시. 예) "오늘 소진", "약 4일 뒤 소진" */
export function runoutLabel(days: number): string {
  return days <= 0 ? "오늘 소진" : `약 ${days}일 뒤 소진`;
}

export interface ReorderInput {
  /** 현재 재고 (기본 단위) */
  current: number;
  /** 부족 알림 기준 (기본 단위). 사용량 기준에서는 안전 재고로 쓴다 */
  minStock: number;
  /** 하루 평균 사용량. 모르면 null */
  perDay: number | null;
  /** 발주하고 입고까지 걸리는 날 */
  leadDays: number;
  /** 한 번 발주로 버틸 날 */
  coverDays: number;
  /** 주문 단위 환산값 (1봉 = 1,000g 이면 1000) */
  factor?: number;
}

export interface ReorderAdvice {
  /** 지금 발주해야 하는지 */
  needed: boolean;
  /** 추천 주문 수량 (주문 단위 개수, 1 이상의 정수) */
  quantity: number;
  /** usage: 하루 평균 사용량 기준 / min_stock: 사용량을 몰라 부족 알림 기준 × 2 */
  basis: "usage" | "min_stock";
}

/**
 * 발주 추천.
 * 사용량을 알면: 재고가 (부족 알림 기준 + 입고까지 쓸 양) 이하이면 발주한다. 입고까지 기다리는 동안 부족해지기 때문이다.
 *   수량은 (부족 알림 기준 + 입고까지 + 버틸 날 동안 쓸 양)까지 채우는 양을 주문 단위로 올림.
 *   예) 원두 하루 200g, 기준 1,000g, 입고 2일, 7일 버팀, 현재 1,300g
 *       → 1,300 ≤ 1,000 + 400 이라 발주. 1,000 + 200 × 9 − 1,300 = 1,500g → 1봉(1,000g) 단위로 2봉
 * 사용량을 모르면: 예전처럼 재고가 부족 알림 기준 이하일 때, 기준 × 2 까지 채우는 양 (suggestOrderQuantity).
 */
export function reorderAdvice(input: ReorderInput): ReorderAdvice {
  const { current, minStock, perDay, leadDays, coverDays, factor = 1 } = input;
  if (perDay === null || perDay <= 0) {
    return {
      needed: stockStatus(current, minStock) !== "ok",
      quantity: suggestOrderQuantity(current, minStock, factor),
      basis: "min_stock",
    };
  }
  if (factor <= 0) throw new Error("단위 환산값(factor)은 0보다 커야 합니다.");
  const reorderPoint = roundQty(minStock + perDay * leadDays);
  const target = roundQty(minStock + perDay * (leadDays + coverDays));
  const need = roundQty(target - Math.max(current, 0));
  return {
    needed: current <= 0 || roundQty(current) <= reorderPoint,
    quantity: Math.max(1, Math.ceil(roundQty(need / factor))),
    basis: "usage",
  };
}
