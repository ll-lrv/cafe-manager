import {
  dateInTimeZone,
  daysUntilExpiry,
  expiryStatus,
  stockStatus,
  type ExpiryStatus,
  type StockStatus,
} from "@cafe/core";
import type { Category, Item } from "@/lib/api/catalog";
import type { LotLevel } from "@/lib/api/stock";

/** 매장 기준 시간대. 유통기한 "오늘"을 이 시간대로 센다. (매장별 설정은 나중에) */
export const STORE_TIME_ZONE = "Asia/Seoul";

/** STORE_TIME_ZONE 의 UTC 차이. 한국은 서머타임이 없어 고정이다. */
const STORE_UTC_OFFSET = "+09:00";

export function storeToday(): string {
  return dateInTimeZone(new Date(), STORE_TIME_ZONE);
}

/** 매장 기준 하루(YYYY-MM-DD)의 시작~다음 날 시작 (ISO) */
export function storeDayRange(date: string): { from: string; to: string } {
  const from = new Date(`${date}T00:00:00${STORE_UTC_OFFSET}`);
  return { from: from.toISOString(), to: new Date(from.getTime() + 86_400_000).toISOString() };
}

/** 매장 기준 그 날의 마지막 순간 (지난 날짜의 판매를 하루 마감으로 입력할 때) */
export function storeEndOfDay(date: string): string {
  return new Date(`${date}T23:59:59${STORE_UTC_OFFSET}`).toISOString();
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
