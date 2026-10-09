import {
  dateInTimeZone,
  daysUntilEmpty,
  daysUntilExpiry,
  type DailyUsage,
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
  /** 최근 하루 평균 사용량. 기록이 짧거나 안 쓰면 null */
  usage: DailyUsage | null;
  /** 지금 재고로 버틸 날 (소진 예상). 사용량을 모르면 null */
  runoutDays: number | null;
}

export function toLotView(lot: LotLevel, today: string): LotView {
  const daysLeft = lot.expiresOn ? daysUntilExpiry(lot.expiresOn, today) : null;
  return { ...lot, daysLeft, expiry: daysLeft === null ? null : expiryStatus(daysLeft) };
}

/** 품목별 재고·유통기한 상태, 소진 예상(usage 를 주면). 보관된 품목은 빠진다. */
export function buildItemLevels(
  items: Pick<Item, "id" | "minStock" | "archivedAt">[],
  stock: Record<string, number>,
  lots: LotLevel[],
  today: string,
  usage: Record<string, DailyUsage> = {},
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
        const itemUsage = usage[item.id] ?? null;
        return [
          item.id,
          {
            quantity,
            status: stockStatus(quantity, item.minStock),
            expiry: nextLot?.expiry ?? null,
            nextLot,
            usage: itemUsage,
            runoutDays: itemUsage ? daysUntilEmpty(quantity, itemUsage.perDay) : null,
          },
        ];
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

/**
 * 마지막 실사보다 이전 시각의 판매를 기록·취소했을 때의 안내.
 * 그 실사에서 센 품목은 실사 수량에 이미 반영돼 있어 재고를 바꾸지 않는다 (DB 트리거가 실사 조정으로 상쇄).
 */
export function countedBeforeNotice(
  lastCountAt: string | null,
  soldAt: string,
  timeZone: string,
  kind: "record" | "cancel",
): string | undefined {
  if (!lastCountAt || Date.parse(soldAt) >= Date.parse(lastCountAt)) return undefined;
  const day = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone }).format(new Date(lastCountAt));
  return kind === "record"
    ? `실사(${day}) 이전 판매라, 그 실사에서 센 품목의 재고는 빼지 않았습니다. 이미 센 수량에 반영돼 있습니다. 매출과 리포트에는 들어갑니다.`
    : `실사(${day}) 이전 판매라, 그 실사에서 센 품목의 재고는 되돌리지 않았습니다. 이미 센 수량에 반영돼 있습니다.`;
}
