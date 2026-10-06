import { costRate, recipeCost } from "@cafe/core";
import type { Menu } from "@/lib/api/menus";

/** 메뉴 원가·원가율. 입고 단가를 모르는 재료가 있으면 missing 에 이름이 담긴다. */
export function menuCost(menu: Menu, costs: Record<string, number>) {
  const { cost, missing } = recipeCost(menu.recipe, costs);
  return {
    cost,
    rate: costRate(menu.price, cost),
    missing: menu.recipe.filter((r) => missing.includes(r.itemId)).map((r) => r.itemName),
  };
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
