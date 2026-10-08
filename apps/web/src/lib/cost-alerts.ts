import {
  BASE_UNIT_LABEL,
  costChangePercent,
  isNotableCostChange,
  menuCostImpacts,
  oneUnitLabel,
  roundQty,
  type MenuCostImpact,
} from "@cafe/core";
import type { Item } from "@/lib/api/catalog";
import type { CostChange, Menu } from "@/lib/api/menus";

export interface CostAlert {
  itemId: string;
  itemName: string;
  changedAt: string;
  /** 변화율(%). 이전 단가가 0이면 null */
  percent: number | null;
  /** 가격의 기준 단위 (기본 입고 단위). 예) "1봉" */
  unit: string;
  /** 단위 하나 가격. 예) "25,000원" */
  priceBefore: string;
  priceAfter: string;
  /** 이 품목을 쓰는 메뉴(보관 제외)의 원가율 변화 */
  impacts: MenuCostImpact[];
}

/** 기본 단위 1개당 원가를 기본 입고 단위 가격으로. 예) 25원/g, 1봉=1000g → { unit: "1봉", price: "25,000원" } */
function unitPrice(unitCost: number, item: Pick<Item, "baseUnit" | "units">): { unit: string; price: string } {
  const unit = item.units.find((u) => u.isDefaultPurchase);
  if (unit) return { unit: oneUnitLabel(unit.name), price: `${Math.round(unitCost * unit.factor).toLocaleString("ko-KR")}원` };
  return { unit: `1${BASE_UNIT_LABEL[item.baseUnit]}`, price: `${roundQty(unitCost).toLocaleString("ko-KR")}원` };
}

/** 예) "1봉 25,000원" */
export function unitPriceText(unitCost: number, item: Pick<Item, "baseUnit" | "units">): string {
  const { unit, price } = unitPrice(unitCost, item);
  return `${unit} ${price}`;
}

/** 예) "1봉 24,000원 → 25,000원" */
export const priceChangeText = (a: Pick<CostAlert, "unit" | "priceBefore" | "priceAfter">) =>
  `${a.unit} ${a.priceBefore} → ${a.priceAfter}`;

/**
 * 단가 변동을 화면에 보여줄 알림으로. notableOnly 면 알림 기준(COST_ALERT_PERCENT) 이상인 것만.
 * 보관된 품목은 뺀다.
 */
export function buildCostAlerts(
  changes: CostChange[],
  items: Item[],
  menus: Menu[],
  costs: Record<string, number>,
  { notableOnly = true }: { notableOnly?: boolean } = {},
): CostAlert[] {
  const itemById = new Map(items.filter((i) => !i.archivedAt).map((i) => [i.id, i]));
  const activeMenus = menus.filter((m) => !m.archivedAt);
  return changes.flatMap((c) => {
    const item = itemById.get(c.itemId);
    if (!item) return [];
    if (notableOnly && !isNotableCostChange(c.previousUnitCost, c.unitCost)) return [];
    return [
      {
        itemId: c.itemId,
        itemName: item.name,
        changedAt: c.changedAt,
        percent: costChangePercent(c.previousUnitCost, c.unitCost),
        unit: unitPrice(c.unitCost, item).unit,
        priceBefore: unitPrice(c.previousUnitCost, item).price,
        priceAfter: unitPrice(c.unitCost, item).price,
        impacts: menuCostImpacts(activeMenus, c.itemId, c.previousUnitCost, costs),
      },
    ];
  });
}

/** "+8%", "−4.5%". 비율이 없으면(이전 0원) "새 단가" */
export function percentText(percent: number | null): string {
  if (percent === null) return "새 단가";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent).toLocaleString("ko-KR")}%`;
}

/** "22.9% → 24.1%". 가격이 0원인 메뉴는 원가로 */
export function impactText(i: MenuCostImpact): string {
  if (i.rateBefore === null || i.rateAfter === null) {
    return `원가 ${i.costBefore.toLocaleString("ko-KR")}원 → ${i.costAfter.toLocaleString("ko-KR")}원`;
  }
  return `원가율 ${i.rateBefore}% → ${i.rateAfter}%`;
}

/**
 * 입고 직후 알림 문구. 예)
 * "우유 단가 +8% (1팩 2,500원 → 2,700원). 카페라떼 원가율 20.6% → 21.4% 외 메뉴 2개"
 */
export function costAlertNotice(alerts: CostAlert[]): string | undefined {
  if (alerts.length === 0) return undefined;
  return alerts
    .map((a) => {
      const head = `${a.itemName} 단가 ${percentText(a.percent)} (${priceChangeText(a)})`;
      const [top, ...rest] = a.impacts;
      if (!top) return `${head}.`;
      return `${head}. ${top.menuName} ${impactText(top)}${rest.length > 0 ? ` 외 메뉴 ${rest.length}개` : ""}`;
    })
    .join("\n");
}
