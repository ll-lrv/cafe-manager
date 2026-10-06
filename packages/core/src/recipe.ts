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

/**
 * 메뉴 1개 원가(원). 재료 사용량 × 재료의 기본 단위당 원가를 더해 원 단위로 반올림한다.
 * 원가를 모르는 재료(입고 단가 기록 없음)는 빼고 계산하고 missing 으로 알려준다.
 */
export function recipeCost(
  recipe: RecipeIngredient[],
  unitCosts: Record<string, number | undefined>,
): { cost: number; missing: string[] } {
  let total = 0;
  const missing: string[] = [];
  for (const r of recipe) {
    const unitCost = unitCosts[r.itemId];
    if (unitCost === undefined) missing.push(r.itemId);
    else total += r.quantity * unitCost;
  }
  return { cost: Math.round(total), missing };
}

/** 원가율(%). 가격이 0이면 null. 예) 가격 4,500원, 원가 900원 → 20 */
export function costRate(price: number, cost: number): number | null {
  if (price <= 0) return null;
  return Math.round((cost / price) * 1000) / 10;
}
