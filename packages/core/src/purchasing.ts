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
