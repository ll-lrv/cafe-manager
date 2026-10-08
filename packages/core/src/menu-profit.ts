/**
 * 메뉴 수익성: 목표 원가율 → 권장 판매가, 기간 동안 메뉴별 매출·원가·마진과 순위.
 * 원가는 지금 레시피 × 재료의 최근 입고 단가 (메뉴 원가율·이론 vs 실제 리포트와 같은 기준).
 */

/** 매장 목표 원가율(%) 기본값 */
export const DEFAULT_TARGET_COST_RATE = 30;

/** 권장 판매가는 이 단위(원)로 올린다 */
export const PRICE_STEP = 100;

/** 메뉴에 목표 원가율이 없으면 매장 기본값 */
export function effectiveTargetRate(menuTarget: number | null | undefined, storeTarget: number): number {
  return menuTarget ?? storeTarget;
}

export function isValidTargetRate(rate: number): boolean {
  return Number.isInteger(rate) && rate >= 1 && rate <= 100;
}

/** 원가율(%)이 목표를 넘었나. 원가율을 모르면(가격 0원) false */
export function isOverTarget(rate: number | null, target: number): boolean {
  return rate !== null && rate > target;
}

/**
 * 목표 원가율을 맞추는 가장 낮은 판매가 (PRICE_STEP 단위로 올림). 원가가 0이면 null.
 * 예) 원가 1,350원, 목표 30% → 4,500원 / 원가 1,360원 → 4,600원
 */
export function suggestedPrice(cost: number, targetRate: number, step = PRICE_STEP): number | null {
  if (cost <= 0 || targetRate <= 0) return null;
  // 부동소수 오차로 4,500 이 4,500.0000001 이 되어 한 단계 올라가지 않도록 원 단위로 먼저 반올림
  const exact = Math.round(((cost * 100) / targetRate) * 1000) / 1000;
  return Math.ceil(exact / step) * step;
}

// ---------------------------------------------------------------- 수익성 순위

/**
 * 메뉴 분류 (메뉴 엔지니어링: 판매량 × 개당 마진)
 * - star: 많이 팔리고 많이 남는다 (효자 메뉴)
 * - plowhorse: 많이 팔리지만 개당 남는 게 적다 → 가격·레시피 검토
 * - puzzle: 많이 남지만 덜 팔린다 → 추천·노출
 * - dog: 덜 팔리고 덜 남는다 → 정리 후보
 */
export type MenuClass = "star" | "plowhorse" | "puzzle" | "dog";

/** 판매량이 (전체 판매량 ÷ 메뉴 수)의 이 비율 이상이면 "많이 팔림" (메뉴 엔지니어링의 70% 규칙) */
export const POPULARITY_FACTOR = 0.7;

export interface MenuProfitInput {
  menuId: string;
  /** 입고 단가를 모르는 재료가 있어 원가가 실제보다 낮다 */
  costIncomplete: boolean;
  /** 레시피가 없다 (원가 0원) */
  noRecipe: boolean;
}

export interface MenuSalesTotal {
  menuId: string;
  /** 취소·반품을 뺀 판매량 */
  quantity: number;
  /** 매출(원) */
  amount: number;
}

/** 메뉴(+옵션 묶음)별 판매 합계와 재료비. 한 메뉴가 옵션 묶음마다 여러 줄일 수 있다 */
export interface MenuSalesCost extends MenuSalesTotal {
  /** 판매량 × 지금 원가(옵션 반영), 원 */
  cost: number;
}

export interface MenuProfitLine {
  menuId: string;
  quantity: number;
  revenue: number;
  /** 판매량 × 지금 원가 (옵션 반영) */
  cost: number;
  /** 매출 − 원가 */
  margin: number;
  /** 개당 마진 (판매량이 0 이하면 null) */
  unitMargin: number | null;
  /** 개당 평균 판매가 (판매량이 0 이하면 null) */
  averagePrice: number | null;
  /** 원가 ÷ 매출(%), 소수점 1자리. 매출이 0 이하면 null */
  costRate: number | null;
  /** 전체 마진 중 이 메뉴 몫 (0~1). 전체 마진이 0 이하면 null */
  marginShare: number | null;
  /** 분류. 판매가 없거나, 판매가 있는 메뉴가 2개 미만이면 null */
  class: MenuClass | null;
  costIncomplete: boolean;
  noRecipe: boolean;
}

export interface MenuProfitSummary {
  revenue: number;
  cost: number;
  margin: number;
  quantity: number;
  /** 원가 ÷ 매출(%), 소수점 1자리 */
  costRate: number | null;
  /** 분류 기준: 판매량 */
  popularityThreshold: number | null;
  /** 분류 기준: 개당 마진 (전체 마진 ÷ 전체 판매량) */
  unitMarginThreshold: number | null;
}

const rate1 = (cost: number, revenue: number) => (revenue > 0 ? Math.round((cost / revenue) * 1000) / 10 : null);

/**
 * 기간 동안의 메뉴별 매출·원가·마진. 마진이 큰 순. 옵션 묶음별 줄은 메뉴로 합친다.
 * 판매가 없는 메뉴는 sales 에 없으면 빠진다. 판매량이 0 이하(모두 취소)인 메뉴는 분류하지 않는다.
 */
export function menuProfitLines(
  menus: MenuProfitInput[],
  sales: MenuSalesCost[],
): { lines: MenuProfitLine[]; summary: MenuProfitSummary } {
  const menuById = new Map(menus.map((m) => [m.menuId, m]));
  const merged = new Map<string, MenuSalesCost>();
  for (const s of sales) {
    const prev = merged.get(s.menuId);
    merged.set(
      s.menuId,
      prev ? { ...prev, quantity: prev.quantity + s.quantity, amount: prev.amount + s.amount, cost: prev.cost + s.cost } : { ...s },
    );
  }
  const base = [...merged.values()].flatMap((s) => {
    const menu = menuById.get(s.menuId);
    if (!menu || (s.quantity === 0 && s.amount === 0)) return [];
    const cost = s.cost;
    const margin = s.amount - cost;
    return [{
      menuId: s.menuId,
      quantity: s.quantity,
      revenue: s.amount,
      cost,
      margin,
      unitMargin: s.quantity > 0 ? Math.round(margin / s.quantity) : null,
      averagePrice: s.quantity > 0 ? Math.round(s.amount / s.quantity) : null,
      costRate: rate1(cost, s.amount),
      costIncomplete: menu.costIncomplete,
      noRecipe: menu.noRecipe,
    }];
  });

  const sum = (f: (l: (typeof base)[number]) => number) => base.reduce((s, l) => s + f(l), 0);
  const revenue = sum((l) => l.revenue);
  const cost = sum((l) => l.cost);
  const margin = revenue - cost;

  // 분류는 판매량이 있는 메뉴끼리 비교한다
  const sold = base.filter((l) => l.quantity > 0);
  const soldQuantity = sold.reduce((s, l) => s + l.quantity, 0);
  const soldMargin = sold.reduce((s, l) => s + l.margin, 0);
  const classify = sold.length >= 2;
  const popularityThreshold = classify ? (soldQuantity / sold.length) * POPULARITY_FACTOR : null;
  const unitMarginThreshold = classify ? soldMargin / soldQuantity : null;

  const lines: MenuProfitLine[] = base
    .map((l) => {
      let cls: MenuClass | null = null;
      if (classify && l.quantity > 0 && l.unitMargin !== null) {
        const popular = l.quantity >= popularityThreshold!;
        const profitable = l.margin / l.quantity >= unitMarginThreshold!;
        cls = popular ? (profitable ? "star" : "plowhorse") : profitable ? "puzzle" : "dog";
      }
      return { ...l, marginShare: margin > 0 ? l.margin / margin : null, class: cls };
    })
    .sort((a, b) => b.margin - a.margin || b.quantity - a.quantity);

  return {
    lines,
    summary: {
      revenue,
      cost,
      margin,
      quantity: sum((l) => l.quantity),
      costRate: rate1(cost, revenue),
      popularityThreshold,
      unitMarginThreshold: unitMarginThreshold === null ? null : Math.round(unitMarginThreshold),
    },
  };
}
