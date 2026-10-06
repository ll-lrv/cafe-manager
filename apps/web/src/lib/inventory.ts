import {
  dateInTimeZone,
  daysUntilExpiry,
  expiryStatus,
  stockStatus,
  type ExpiryStatus,
  type StockStatus,
} from "@cafe/core";
import type { Item } from "@/lib/api/catalog";
import type { LotLevel } from "@/lib/api/stock";

/** 매장 기준 시간대. 유통기한 "오늘"을 이 시간대로 센다. (매장별 설정은 나중에) */
export const STORE_TIME_ZONE = "Asia/Seoul";

export function storeToday(): string {
  return dateInTimeZone(new Date(), STORE_TIME_ZONE);
}

export interface LotView extends LotLevel {
  /** 유통기한까지 남은 날. 기한이 없으면 null */
  daysLeft: number | null;
  expiry: ExpiryStatus | null;
}

export interface ItemLevel {
  /** 현재 재고 (기본 단위) */
  quantity: number;
  status: StockStatus;
  /** 남은 로트 중 가장 급한 유통기한 상태 */
  expiry: ExpiryStatus | null;
  /** 남은 로트 중 기한이 가장 빠른 것 */
  nextLot: LotView | null;
}

export function toLotView(lot: LotLevel, today: string): LotView {
  const daysLeft = lot.expiresOn ? daysUntilExpiry(lot.expiresOn, today) : null;
  return { ...lot, daysLeft, expiry: daysLeft === null ? null : expiryStatus(daysLeft) };
}

/** 품목별 재고·유통기한 상태. 보관된 품목은 빠진다. */
export function buildItemLevels(
  items: Pick<Item, "id" | "minStock" | "archivedAt">[],
  stock: Record<string, number>,
  lots: LotLevel[],
  today: string,
): Record<string, ItemLevel> {
  // lots 는 기한이 빠른 순으로 들어온다.
  const firstLot = new Map<string, LotView>();
  for (const lot of lots) {
    if (lot.expiresOn && !firstLot.has(lot.itemId)) firstLot.set(lot.itemId, toLotView(lot, today));
  }
  return Object.fromEntries(
    items
      .filter((item) => !item.archivedAt)
      .map((item) => {
        const quantity = stock[item.id] ?? 0;
        const nextLot = firstLot.get(item.id) ?? null;
        return [item.id, { quantity, status: stockStatus(quantity, item.minStock), expiry: nextLot?.expiry ?? null, nextLot }];
      }),
  );
}
