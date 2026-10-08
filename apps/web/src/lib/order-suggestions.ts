import { DEFAULT_COVER_DAYS, DEFAULT_LEAD_DAYS, reorderAdvice, type DailyUsage, type ReorderAdvice } from "@cafe/core";
import type { Item } from "@/lib/api/catalog";
import type { OrderLineInput } from "@/lib/api/purchasing";
import type { Supplier } from "@/lib/api/suppliers";

export type SupplierTerms = Pick<Supplier, "id" | "leadDays" | "coverDays">;

export interface OrderSuggestion extends OrderLineInput {
  itemName: string;
}

/**
 * 품목 하나의 발주 추천 (core reorderAdvice). 입고까지 걸리는 날·버틸 날은 기본 거래처 것을 쓰고,
 * 기본 거래처가 없으면 기본값(1일·7일). 사용량을 모르면 부족 알림 기준으로 판단한다.
 */
export function itemReorderAdvice(
  item: Pick<Item, "id" | "minStock" | "units">,
  stock: Record<string, number>,
  usage: Record<string, DailyUsage>,
  supplier: Pick<Supplier, "leadDays" | "coverDays"> | undefined,
): ReorderAdvice {
  const unit = item.units.find((u) => u.isDefaultPurchase) ?? null;
  return reorderAdvice({
    current: stock[item.id] ?? 0,
    minStock: item.minStock,
    perDay: usage[item.id]?.perDay ?? null,
    leadDays: supplier?.leadDays ?? DEFAULT_LEAD_DAYS,
    coverDays: supplier?.coverDays ?? DEFAULT_COVER_DAYS,
    factor: unit?.factor ?? 1,
  });
}

/**
 * 거래처에 담을 추천 품목. 기본 거래처가 그 거래처이고, 지금 발주해야 하는 품목.
 * 최근 사용량을 알면 입고까지 버티지 못하는 품목을 (입고까지 + 버틸 날) 동안 쓸 양만큼,
 * 모르면 부족한 품목을 부족 알림 기준의 2배까지 (core reorderAdvice). 수량은 기본 입고 단위.
 * 단가는 최근 입고 단가 × 단위 환산값.
 */
export function buildOrderSuggestions(
  items: Item[],
  stock: Record<string, number>,
  latestCosts: Record<string, number>,
  usage: Record<string, DailyUsage>,
  supplier: SupplierTerms,
  excludeItemIds: string[] = [],
): OrderSuggestion[] {
  return items.flatMap((i) => {
    if (i.defaultSupplierId !== supplier.id || i.archivedAt || excludeItemIds.includes(i.id)) return [];
    const advice = itemReorderAdvice(i, stock, usage, supplier);
    if (!advice.needed) return [];
    const unit = i.units.find((u) => u.isDefaultPurchase) ?? null;
    const cost = latestCosts[i.id];
    return [
      {
        itemId: i.id,
        itemName: i.name,
        unitId: unit?.id ?? null,
        quantity: advice.quantity,
        unitPrice: cost === undefined ? null : Math.round(cost * (unit?.factor ?? 1)),
      },
    ];
  });
}
