import "server-only";
import { dailyUsage, dateInTimeZone, USAGE_WINDOW_DAYS, type DailyUsage } from "@cafe/core";
import { listItemUsage } from "@/lib/api/stock";
import { addDays, storeDayRange, storeToday } from "@/lib/inventory";

/**
 * 품목별 하루 평균 사용량 (오늘을 뺀 최근 14일, 매장 시간대 기준).
 * 판매·사용 기록이 3일보다 짧거나 쓴 양이 없는 품목은 빠진다 (core dailyUsage).
 */
export async function loadDailyUsage(storeId: string, timeZone: string): Promise<Record<string, DailyUsage>> {
  const today = storeToday(timeZone);
  const rows = await listItemUsage(storeId, {
    from: storeDayRange(addDays(today, -USAGE_WINDOW_DAYS), timeZone).from,
    to: storeDayRange(today, timeZone).from,
  });
  return Object.fromEntries(
    rows.flatMap((r) => {
      const usage = dailyUsage(r.used, dateInTimeZone(new Date(r.firstUsedAt), timeZone), today);
      return usage ? [[r.itemId, usage]] : [];
    }),
  );
}
