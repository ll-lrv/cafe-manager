import { costRate, recipeCost, type RecipeIngredient } from "./recipe";

/** 입고 단가가 이만큼(%) 이상 바뀌면 알린다. */
export const COST_ALERT_PERCENT = 5;
/** 대시보드에는 최근 이 기간(일) 안에 바뀐 단가만 보여준다. */
export const COST_ALERT_DAYS = 14;

/**
 * 단가 변화율(%). 소수점 1자리. 예) 2,500원 → 2,700원 = 8
 * 이전 단가가 0이면 비율을 낼 수 없어 null.
 */
export function costChangePercent(previous: number, current: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** 알릴 만한 변화인가. 이전 단가가 0이었다가 생긴 경우(비율 없음)도 알린다. */
export function isNotableCostChange(previous: number, current: number): boolean {
  if (previous === current) return false;
  const percent = costChangePercent(previous, current);
  return percent === null || Math.abs(percent) >= COST_ALERT_PERCENT;
}

export interface CostImpactMenu {
  id: string;
  name: string;
  /** 원(KRW) */
  price: number;
  recipe: RecipeIngredient[];
}

export interface MenuCostImpact {
  menuId: string;
  menuName: string;
  costBefore: number;
  costAfter: number;
  /** 원가율(%). 가격이 0이면 null */
  rateBefore: number | null;
  rateAfter: number | null;
}

/**
 * 품목 하나의 단가가 previousUnitCost 에서 지금(unitCosts[itemId])으로 바뀌었을 때 메뉴 원가·원가율 변화.
 * 다른 재료는 지금 단가 그대로 두고, 그 품목을 쓰는 메뉴만 돌려준다. 원가율이 많이 바뀐 순.
 * 예) 우유 +8% → 카페라떼 원가율 22.9% → 24.1%
 */
export function menuCostImpacts(
  menus: CostImpactMenu[],
  itemId: string,
  previousUnitCost: number,
  unitCosts: Record<string, number | undefined>,
): MenuCostImpact[] {
  const before = { ...unitCosts, [itemId]: previousUnitCost };
  return menus
    .filter((m) => m.recipe.some((r) => r.itemId === itemId))
    .map((m) => {
      const costBefore = recipeCost(m.recipe, before).cost;
      const costAfter = recipeCost(m.recipe, unitCosts).cost;
      return {
        menuId: m.id,
        menuName: m.name,
        costBefore,
        costAfter,
        rateBefore: costRate(m.price, costBefore),
        rateAfter: costRate(m.price, costAfter),
      };
    })
    .sort((a, b) => rateShift(b) - rateShift(a) || a.menuName.localeCompare(b.menuName, "ko"));
}

const rateShift = (i: MenuCostImpact) => Math.abs((i.rateAfter ?? 0) - (i.rateBefore ?? 0));
