import { stockStatus, suggestOrderQuantity } from "@cafe/core";
import type { Item } from "@/lib/api/catalog";
import type { OrderLineInput } from "@/lib/api/purchasing";

export interface OrderSuggestion extends OrderLineInput {
  itemName: string;
}

/**
 * 거래처에 담을 부족 품목 추천. 기본 거래처가 그 거래처이고, 재고가 없거나 부족한 품목.
 * 수량은 기본 입고 단위로, 부족 알림 기준의 2배까지 채우는 양(core suggestOrderQuantity).
 * 단가는 최근 입고 단가 × 단위 환산값.
 */
export function buildOrderSuggestions(
  items: Item[],
  stock: Record<string, number>,
  latestCosts: Record<string, number>,
  supplierId: string,
  excludeItemIds: string[] = [],
): OrderSuggestion[] {
  return items
    .filter(
      (i) =>
        i.defaultSupplierId === supplierId &&
        !i.archivedAt &&
        !excludeItemIds.includes(i.id) &&
        stockStatus(stock[i.id] ?? 0, i.minStock) !== "ok",
    )
    .map((i) => {
      const unit = i.units.find((u) => u.isDefaultPurchase) ?? null;
      const factor = unit?.factor ?? 1;
      const cost = latestCosts[i.id];
      return {
        itemId: i.id,
        itemName: i.name,
        unitId: unit?.id ?? null,
        quantity: suggestOrderQuantity(stock[i.id] ?? 0, i.minStock, factor),
        unitPrice: cost === undefined ? null : Math.round(cost * factor),
      };
    });
}
