import { roundQty } from "./quantity";

export interface RecipeIngredient {
  itemId: string;
  /** 메뉴 1개당 사용량 (기본 단위) */
  quantity: number;
}

export interface StockDelta {
  itemId: string;
  /** 부호 포함 기본 단위 수량 */
  quantity: number;
}

/**
 * 판매 수량만큼 레시피 재료 차감량을 계산한다.
 * 예) 아메리카노(원두 18g, 컵 1개) 3잔 → 원두 -54g, 컵 -3개
 */
export function saleDeductions(recipe: RecipeIngredient[], soldQuantity: number): StockDelta[] {
  if (!Number.isInteger(soldQuantity) || soldQuantity <= 0) {
    throw new Error("판매 수량은 1 이상의 정수여야 합니다.");
  }
  return mergeDeltas(
    recipe.map((r) => ({ itemId: r.itemId, quantity: -roundQty(r.quantity * soldQuantity) })),
  );
}

/** 같은 품목의 증감을 하나로 합친다. 합이 0인 품목은 뺀다. */
export function mergeDeltas(deltas: StockDelta[]): StockDelta[] {
  const byItem = new Map<string, number>();
  for (const d of deltas) {
    byItem.set(d.itemId, roundQty((byItem.get(d.itemId) ?? 0) + d.quantity));
  }
  return [...byItem]
    .filter(([, q]) => q !== 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}
