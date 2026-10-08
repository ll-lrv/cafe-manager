import "server-only";
import { listStockCounts } from "@/lib/api/counts";
import type { StoreMembership } from "@/lib/api/stores";
import { addDays, isValidDate, storeDayRange, storeToday } from "@/lib/inventory";

export interface Period {
  key: string;
  label: string;
  href: string;
  /** from 이상 to 미만 (ISO) */
  range: { from: string; to: string };
}

export interface ResolvedPeriods {
  period: Period;
  /** 고를 수 있는 기간 (실사 구간 → 날짜) */
  choices: Period[];
  /** 직접 고르는 칸의 기본값 */
  custom: { from: string; to: string };
  today: string;
  /** 끝난 실사 (최근 것부터). 실사 구간을 쓸 때만 */
  completedCounts: { completedAt: string }[];
}

/** 실사 완료 시각 바로 뒤 (그 실사의 조정은 완료 시각에 기록되므로, 구간을 (앞 실사, 이번 실사] 로 자르기 위해) */
const justAfter = (iso: string) => new Date(Date.parse(iso) + 1).toISOString();

/**
 * 리포트 기간 고르기: 실사 구간(?count=) → 날짜(?from=&to=) → 기본.
 * withCounts: 끝난 실사 두 개 사이 구간(최근 3개)도 고를 수 있게 하고, 기본을 가장 최근 실사 구간으로 (없으면 defaultDays)
 */
export async function resolvePeriods(
  store: StoreMembership,
  params: Record<string, string | string[] | undefined>,
  { basePath, withCounts, defaultDays }: { basePath: string; withCounts: boolean; defaultDays: 7 | 30 },
): Promise<ResolvedPeriods> {
  const today = storeToday(store.timeZone);
  const dayLabel = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: store.timeZone });
  const dateText = (date: string) => dayLabel.format(new Date(`${date}T12:00:00Z`));
  const days = (from: string, to: string) => ({
    from: storeDayRange(from, store.timeZone).from,
    to: storeDayRange(to, store.timeZone).to,
  });

  const completed = withCounts
    ? (await listStockCounts(store.storeId))
        .filter((c) => c.status === "completed" && c.completedAt)
        .map((c) => ({ ...c, completedAt: c.completedAt! }))
        .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    : [];
  const countPeriods: Period[] = completed.slice(0, 3).flatMap((c, i) => {
    const prev = completed[i + 1];
    if (!prev) return [];
    return [{
      key: `count:${c.id}`,
      label: `실사 ${dayLabel.format(new Date(prev.completedAt))} → ${dayLabel.format(new Date(c.completedAt))}${c.categoryName ? ` (${c.categoryName})` : ""}`,
      href: `${basePath}?count=${c.id}`,
      range: { from: justAfter(prev.completedAt), to: justAfter(c.completedAt) },
    }];
  });
  const datePeriods: Period[] = [
    { label: "최근 7일", from: addDays(today, -6) },
    { label: "최근 30일", from: addDays(today, -29) },
    { label: "이번 달", from: `${today.slice(0, 8)}01` },
  ].map((p) => ({ key: `days:${p.from}:${today}`, label: p.label, href: `${basePath}?from=${p.from}&to=${today}`, range: days(p.from, today) }));

  let period: Period;
  const fromParam = typeof params.from === "string" ? params.from : undefined;
  const toParam = typeof params.to === "string" ? params.to : undefined;
  const byCount = countPeriods.find((p) => p.key === `count:${params.count}`);
  if (byCount) {
    period = byCount;
  } else if (isValidDate(fromParam) && isValidDate(toParam) && fromParam <= toParam && toParam <= today) {
    period = datePeriods.find((p) => p.key === `days:${fromParam}:${toParam}`) ?? {
      key: `days:${fromParam}:${toParam}`,
      label: `${dateText(fromParam)} ~ ${dateText(toParam)}`,
      href: `${basePath}?from=${fromParam}&to=${toParam}`,
      range: days(fromParam, toParam),
    };
  } else {
    period = countPeriods[0] ?? datePeriods[defaultDays === 7 ? 0 : 1]!;
  }

  const [, customFrom, customTo] = period.key.startsWith("days:") ? period.key.split(":") : [];
  return {
    period,
    choices: [...countPeriods, ...datePeriods],
    custom: { from: customFrom ?? addDays(today, -(defaultDays - 1)), to: customTo ?? today },
    today,
    completedCounts: completed,
  };
}
