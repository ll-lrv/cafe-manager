/** 매장 시간대 기본값 */
export const DEFAULT_TIME_ZONE = "Asia/Seoul";

/** IANA 시간대 이름인지 (예: "Asia/Seoul") */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * 그 시간대 기준 날짜(YYYY-MM-DD). 서버가 어느 시간대에서 돌든 매장 기준 "오늘"을 구할 때 쓴다.
 * 예) dateInTimeZone(new Date(), "Asia/Seoul")
 */
export function dateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** 그 순간 시간대의 UTC 차이 (ms). 서머타임이 있는 곳은 순간마다 다르다. */
function utcOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wallAsUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * 그 시간대의 벽시계 시각 → 실제 순간.
 * 예) zonedTimeToUtc("2026-10-07", "23:59:59", "Asia/Seoul") → 2026-10-07T14:59:59Z
 * 서머타임으로 없는 시각(시계를 앞당기는 밤)은 앞당긴 뒤의 시각으로 맞춰진다.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const wall = Date.parse(`${date}T${time}Z`);
  if (Number.isNaN(wall)) throw new Error(`올바르지 않은 날짜·시각: ${date} ${time}`);
  // 벽시계 시각에서 차이를 빼되, 그 순간의 차이가 다를 수 있어(서머타임 경계) 한 번 더 맞춘다.
  const first = wall - utcOffsetMs(wall, timeZone);
  return new Date(wall - utcOffsetMs(first, timeZone));
}
