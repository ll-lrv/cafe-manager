import {
  dateInTimeZone,
  daysUntilExpiry,
  expiryStatus,
  stockStatus,
  type ExpiryStatus,
  type StockStatus,
  zonedTimeToUtc,
} from "@cafe/core";
import type { Category, Item } from "@/lib/api/catalog";
import type { LotLevel } from "@/lib/api/stock";

/** 매장 시간대 기준 오늘 (YYYY-MM-DD) */
export function storeToday(timeZone: string): string {
  return dateInTimeZone(new Date(), timeZone);
}

/** 매장 시간대 기준 하루(YYYY-MM-DD)의 시작~다음 날 시작 (ISO). 서머타임이 있는 곳은 23·25시간일 수 있다. */
export function storeDayRange(date: string, timeZone: string): { from: string; to: string } {
  return {
    from: zonedTimeToUtc(date, "00:00:00", timeZone).toISOString(),
    to: zonedTimeToUtc(addDays(date, 1), "00:00:00", timeZone).toISOString(),
  };
}

/** 매장 시간대 기준 그 날의 마지막 순간 (지난 날짜의 판매를 하루 마감으로 입력할 때) */
export function storeEndOfDay(date: string, timeZone: string): string {
  return zonedTimeToUtc(date, "23:59:59", timeZone).toISOString();
}

/** YYYY-MM-DD 에 n일 더하기 */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
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

/** 선택 목록용: 보관 품목을 빼고 카테고리 순서 → 이름 순 (미분류는 맨 뒤) */
export function activeItemsInCategoryOrder<T extends Pick<Item, "name" | "categoryId" | "archivedAt">>(
  items: T[],
  categories: Category[],
): T[] {
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const rank = (item: T) => (item.categoryId ? (order.get(item.categoryId) ?? 0) : Infinity);
  return items
    .filter((i) => !i.archivedAt)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "ko"));
}
