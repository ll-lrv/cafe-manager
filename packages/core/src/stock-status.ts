/** 재고 상태. out: 없음(0 이하)  low: 부족 알림 기준 이하  ok: 충분 */
export type StockStatus = "out" | "low" | "ok";

export function stockStatus(quantity: number, minStock: number): StockStatus {
  if (quantity <= 0) return "out";
  if (quantity <= minStock) return "low";
  return "ok";
}

/** 유통기한이 이 날수 이하로 남으면 임박으로 본다. (오늘이 기한이면 0일) */
export const EXPIRY_SOON_DAYS = 3;

export type ExpiryStatus = "expired" | "soon" | "ok";

export function expiryStatus(daysLeft: number, soonDays: number = EXPIRY_SOON_DAYS): ExpiryStatus {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= soonDays) return "soon";
  return "ok";
}

/** 남은 날수 표시. 예) "D-3", "오늘까지", "2일 지남" */
export function expiryLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft}일 지남`;
  if (daysLeft === 0) return "오늘까지";
  return `D-${daysLeft}`;
}
