import { applyOptions, costRate, effectiveTargetRate, isOverTarget, recipeCost, suggestedPrice } from "@cafe/core";
import type { Menu } from "@/lib/api/menus";
import { toOptionRules, type MenuOption } from "@/lib/api/options";

/**
 * 메뉴 원가·원가율과 목표 원가율 비교. 입고 단가를 모르는 재료가 있으면 missing 에 이름이 담긴다.
 * suggestedPrice: 목표 원가율을 맞추는 가장 낮은 판매가 (원가가 0이면 null)
 */
export function menuCost(menu: Pick<Menu, "price" | "recipe" | "targetCostRate">, costs: Record<string, number>, storeTargetRate: number) {
  const { cost, missing } = recipeCost(menu.recipe, costs);
  const rate = costRate(menu.price, cost);
  const target = effectiveTargetRate(menu.targetCostRate, storeTargetRate);
  return {
    cost,
    rate,
    missing: menu.recipe.filter((r) => missing.includes(r.itemId)).map((r) => r.itemName),
    target,
    overTarget: menu.recipe.length > 0 && isOverTarget(rate, target),
    suggestedPrice: suggestedPrice(cost, target),
  };
}

/**
 * 옵션을 붙인 메뉴 1개 원가(원). 옵션이 없으면 메뉴 원가와 같다.
 * incomplete: 입고 단가를 모르는 재료가 있어 실제보다 낮다
 */
export function optionSetCost(
  menu: Pick<Menu, "recipe">,
  options: Pick<MenuOption, "rules">[],
  costs: Record<string, number>,
): { cost: number; incomplete: boolean } {
  const recipe = applyOptions(menu.recipe, options.flatMap(toOptionRules));
  const { cost, missing } = recipeCost(recipe, costs);
  return { cost, incomplete: missing.length > 0 };
}

export type OverTargetMenu = ReturnType<typeof menuCost> & { menu: Menu };

/** 지금 가격으로 목표 원가율을 넘는 판매 중인 메뉴. 목표를 많이 넘은 순 */
export function overTargetMenus(menus: Menu[], costs: Record<string, number>, storeTargetRate: number): OverTargetMenu[] {
  return menus
    .filter((m) => !m.archivedAt)
    .map((m) => ({ menu: m, ...menuCost(m, costs, storeTargetRate) }))
    .filter((m) => m.overTarget)
    .sort((a, b) => (b.rate ?? 0) - b.target - ((a.rate ?? 0) - a.target));
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
