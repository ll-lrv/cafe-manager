import type { UsageTotals } from "./avt";
import { roundQty } from "./quantity";

/** 폐기 사유. DB enum waste_reason 과 같은 값 */
export type WasteReason = "expired" | "spoiled" | "mistake" | "damaged" | "other";

/** 폐기 사유 선택지 (화면에 보이는 순서) */
export const WASTE_REASONS: { value: WasteReason; label: string; hint: string }[] = [
  { value: "expired", label: "유통기한 지남", hint: "기한이 지나 버림" },
  { value: "spoiled", label: "상함·품질 이상", hint: "기한 전에 상했거나 맛·상태가 이상함" },
  { value: "mistake", label: "제조 실수", hint: "잘못 만든 음료, 주문 착오" },
  { value: "damaged", label: "쏟음·파손", hint: "쏟거나 떨어뜨림, 포장 파손" },
  { value: "other", label: "기타", hint: "메모에 사유를 적어 주세요" },
];

export function isWasteReason(value: unknown): value is WasteReason {
  return WASTE_REASONS.some((r) => r.value === value);
}

/** 사유 이름. 사유 기능 전에 기록한 폐기는 "사유 없음" */
export function wasteReasonLabel(reason: WasteReason | null): string {
  return WASTE_REASONS.find((r) => r.value === reason)?.label ?? "사유 없음";
}

/** 기간 동안 품목·사유별 폐기량 (기본 단위, 양수) */
export interface WasteTotal {
  itemId: string;
  reason: WasteReason | null;
  quantity: number;
}

export interface WasteItemLine {
  itemId: string;
  /** 폐기량 (기본 단위) */
  quantity: number;
  /** 원(KRW). 입고 단가가 없으면 null */
  cost: number | null;
  /** 사유별 폐기량, 많은 순 */
  reasons: { reason: WasteReason | null; quantity: number }[];
}

export interface WasteReasonLine {
  reason: WasteReason | null;
  /** 원(KRW). 단가를 아는 품목만 */
  cost: number;
  /** 폐기 금액 중 비율 (0~1). 폐기 금액이 0 이면 0 */
  share: number;
}

export interface WasteReport {
  /** 폐기 금액 (단가를 아는 품목만) */
  wasteCost: number;
  /** 나간 재료 금액 = 판매 + 레시피 밖 사용 + 폐기 (단가를 아는 품목만) */
  outflowCost: number;
  /** 폐기율 = 폐기 금액 ÷ 나간 재료 금액. 나간 재료가 없으면 null */
  wasteRate: number | null;
  /** 매출 대비 = 폐기 금액 ÷ 매출. 매출이 없으면 null */
  salesRate: number | null;
  /** 사유별, 금액 큰 순 (금액이 같으면 선택지 순서, 사유 없음은 맨 뒤) */
  byReason: WasteReasonLine[];
  /** 품목별, 금액 큰 순 (단가 없는 품목은 맨 뒤) */
  byItem: WasteItemLine[];
  /** 폐기했지만 입고 단가가 없어 금액에서 빠진 품목 */
  missingCostItemIds: string[];
}

const reasonOrder = (r: WasteReason | null) => (r === null ? WASTE_REASONS.length : WASTE_REASONS.findIndex((x) => x.value === r));

/**
 * 폐기 리포트. 금액은 최근 입고 단가 기준 (이론 vs 실제와 같은 기준).
 * 폐기율의 분모는 기간 동안 판매·사용·폐기로 나간 재료 금액이다 ("쓴 재료 중 몇 %를 버렸나").
 * 금액은 품목(사유)마다 반올림해서 더하므로 사유별 합계와 전체가 1원쯤 다를 수 있다.
 */
export function wasteReport(input: {
  wastes: WasteTotal[];
  usage: UsageTotals[];
  /** 품목별 기본 단위 1개당 원가 */
  unitCosts: Record<string, number>;
  /** 기간 매출 (원) */
  salesAmount: number;
}): WasteReport {
  const { wastes, usage, unitCosts, salesAmount } = input;
  const won = (itemId: string, q: number) => {
    const c = unitCosts[itemId];
    return c === undefined ? null : Math.round(q * c);
  };

  const items = new Map<string, WasteItemLine>();
  const reasonCost = new Map<WasteReason | null, number>();
  for (const w of wastes) {
    if (w.quantity <= 0) continue;
    const line = items.get(w.itemId) ?? { itemId: w.itemId, quantity: 0, cost: null, reasons: [] };
    line.quantity = roundQty(line.quantity + w.quantity);
    line.reasons.push({ reason: w.reason, quantity: roundQty(w.quantity) });
    items.set(w.itemId, line);
    const cost = won(w.itemId, w.quantity);
    if (cost !== null) reasonCost.set(w.reason, (reasonCost.get(w.reason) ?? 0) + cost);
  }
  const byItem = [...items.values()].map((l) => ({
    ...l,
    cost: won(l.itemId, l.quantity),
    reasons: l.reasons.sort((a, b) => b.quantity - a.quantity || reasonOrder(a.reason) - reasonOrder(b.reason)),
  }));
  byItem.sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.quantity - a.quantity);

  const wasteCost = byItem.reduce((sum, l) => sum + (l.cost ?? 0), 0);
  const outflowCost = usage.reduce((sum, t) => sum + (won(t.itemId, -(t.sold + t.consumed + t.wasted)) ?? 0), 0);
  const byReason = [...reasonCost]
    .map(([reason, cost]) => ({ reason, cost, share: wasteCost > 0 ? cost / wasteCost : 0 }))
    .sort((a, b) => b.cost - a.cost || reasonOrder(a.reason) - reasonOrder(b.reason));

  return {
    wasteCost,
    outflowCost,
    wasteRate: outflowCost > 0 ? wasteCost / outflowCost : null,
    salesRate: salesAmount > 0 ? wasteCost / salesAmount : null,
    byReason,
    byItem,
    missingCostItemIds: byItem.filter((l) => l.cost === null).map((l) => l.itemId),
  };
}
