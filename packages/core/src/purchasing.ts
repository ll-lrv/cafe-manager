import { roundQty } from "./quantity";

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

export interface OrderLineProgress {
  /** 주문 수량 (주문 단위) */
  quantity: number;
  /** 입고된 수량 (주문 단위) */
  receivedQuantity: number;
}

/** 라인별 입고 진행 상황으로 발주서 상태를 계산한다. draft/cancelled 는 사람이 정하는 상태라 그대로 둔다. */
export function derivePurchaseOrderStatus(
  current: PurchaseOrderStatus,
  lines: OrderLineProgress[],
): PurchaseOrderStatus {
  if (current === "draft" || current === "cancelled") return current;
  if (lines.length === 0) return current;
  const anyReceived = lines.some((l) => l.receivedQuantity > 0);
  const allReceived = lines.every((l) => roundQty(l.receivedQuantity) >= roundQty(l.quantity));
  if (allReceived) return "received";
  if (anyReceived) return "partially_received";
  return "ordered";
}

/** 부족 품목을 채울 때 목표 재고 = 부족 알림 기준 × 이 배수 */
export const REORDER_TARGET_MULTIPLIER = 2;

/**
 * 추천 주문 수량 (주문 단위 개수, 1 이상의 정수).
 * 부족 알림 기준의 2배까지 채우는 양을 주문 단위로 올림한다. 기준이 0이면 1단위.
 * 예) 원두 기준 2,000g, 현재 500g, 1봉 = 1,000g → (4,000 − 500) / 1,000 → 4봉
 */
export function suggestOrderQuantity(current: number, minStock: number, factor = 1): number {
  if (factor <= 0) throw new Error("단위 환산값(factor)은 0보다 커야 합니다.");
  const need = roundQty(minStock * REORDER_TARGET_MULTIPLIER - Math.max(current, 0));
  return Math.max(1, Math.ceil(roundQty(need / factor)));
}

/** 발주 금액 합계(원). 단가가 없는 줄은 빼고 더한다. */
export function orderTotal(lines: { quantity: number; unitPrice: number | null }[]): number {
  return Math.round(lines.reduce((sum, l) => sum + (l.unitPrice === null ? 0 : l.quantity * l.unitPrice), 0));
}
