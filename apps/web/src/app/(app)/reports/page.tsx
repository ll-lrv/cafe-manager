import { avtLine, avtSummary, can, formatQuantity, sortAvtLines, type AvtLine } from "@cafe/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listItems, type Item } from "@/lib/api/catalog";
import { listStockCounts } from "@/lib/api/counts";
import { getLatestCosts } from "@/lib/api/menus";
import { getUsageTotals } from "@/lib/api/reports";
import { listSales } from "@/lib/api/sales";
import { requireCurrentStore } from "@/lib/api/stores";
import { addDays, isValidDate, storeDayRange, storeToday } from "@/lib/inventory";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "이론 vs 실제" };

/** 차이율이 이 이상이면 눈에 띄게 표시한다 */
const WARN_RATE = 0.05;
const ALERT_RATE = 0.1;

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const signedWon = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("ko-KR")}원`;
const percent = (r: number) => `${(r * 100).toFixed(1)}%`;

interface Period {
  key: string;
  label: string;
  href: string;
  range: { from: string; to: string };
}

/** 실사 완료 시각 바로 뒤 (그 실사의 조정은 완료 시각에 기록되므로, 구간을 (앞 실사, 이번 실사] 로 자르기 위해) */
const justAfter = (iso: string) => new Date(Date.parse(iso) + 1).toISOString();

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const [params, store] = await Promise.all([searchParams, requireCurrentStore()]);
  if (!can(store.role, "report:view")) {
    return <p className="text-sm text-muted-foreground">리포트는 사장과 매니저만 볼 수 있습니다.</p>;
  }
  const today = storeToday(store.timeZone);
  const dayLabel = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: store.timeZone });
  const dateText = (date: string) => dayLabel.format(new Date(`${date}T12:00:00Z`));
  const days = (from: string, to: string) => ({
    from: storeDayRange(from, store.timeZone).from,
    to: storeDayRange(to, store.timeZone).to,
  });

  // 실사 구간: 끝난 실사 두 개 사이 (최근 것부터 3개)
  const completed = (await listStockCounts(store.storeId))
    .filter((c) => c.status === "completed" && c.completedAt)
    .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!));
  const countPeriods: Period[] = completed.slice(0, 3).flatMap((c, i) => {
    const prev = completed[i + 1];
    if (!prev) return [];
    return [{
      key: `count:${c.id}`,
      label: `실사 ${dayLabel.format(new Date(prev.completedAt!))} → ${dayLabel.format(new Date(c.completedAt!))}${c.categoryName ? ` (${c.categoryName})` : ""}`,
      href: `/reports?count=${c.id}`,
      range: { from: justAfter(prev.completedAt!), to: justAfter(c.completedAt!) },
    }];
  });
  const datePeriods: Period[] = [
    { key: "7", label: "최근 7일", from: addDays(today, -6) },
    { key: "30", label: "최근 30일", from: addDays(today, -29) },
    { key: "month", label: "이번 달", from: `${today.slice(0, 8)}01` },
  ].map((p) => ({ key: `days:${p.from}:${today}`, label: p.label, href: `/reports?from=${p.from}&to=${today}`, range: days(p.from, today) }));

  // 기간 고르기: 실사 구간 → 날짜 → 기본(가장 최근 실사 구간, 없으면 최근 7일)
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
      href: `/reports?from=${fromParam}&to=${toParam}`,
      range: days(fromParam, toParam),
    };
  } else {
    period = countPeriods[0] ?? datePeriods[0];
  }
  const customFrom = period.key.startsWith("days:") ? period.key.split(":")[1] : addDays(today, -6);

  const [items, totals, costs, sales] = await Promise.all([
    listItems(store.storeId),
    getUsageTotals(store.storeId, period.range),
    getLatestCosts(store.storeId),
    listSales(store.storeId, period.range),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const lines = sortAvtLines(
    totals
      .filter((t) => itemById.has(t.itemId))
      .map((t) => avtLine(t, costs[t.itemId] ?? null))
      .filter((l) => l.theoretical !== 0 || l.variance !== 0),
  );
  const revenue = sales.reduce((sum, s) => sum + s.amount, 0);
  const summary = avtSummary(lines, revenue);
  // DB 시각(마이크로초, +00:00)과 ISO 문자열은 형식이 달라 문자열로 비교하지 않는다
  const inRange = (iso: string) => Date.parse(iso) >= Date.parse(period.range.from) && Date.parse(iso) < Date.parse(period.range.to);
  const hasCount = completed.some((c) => inRange(c.completedAt!));
  const causeTexts = (
    [
      ["레시피 밖 사용", summary.causeCosts.consumed],
      ["폐기", summary.causeCosts.wasted],
      ["실사 차이", summary.causeCosts.countLoss],
      ["직접 조정", summary.causeCosts.otherAdjust],
    ] as const
  )
    .filter(([, cost]) => cost !== 0)
    .map(([label, cost]) => `${label} ${signedWon(cost)}`);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-bold">이론 vs 실제 사용량</h1>
        <p className="text-sm text-muted-foreground">
          레시피대로라면 쓰였어야 할 양(이론)과 실제로 줄어든 양을 비교합니다. 차이가 크면 레시피보다 많이 담았거나,
          기록하지 않은 사용·폐기·분실이 있었다는 뜻입니다.
        </p>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {[...countPeriods, ...datePeriods].map((p) => (
            <Link
              key={p.key}
              href={p.href}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                p.key === period.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm" action="/reports">
          <Input type="date" name="from" defaultValue={customFrom} max={today} aria-label="시작일" className="w-auto" />
          <span>~</span>
          <Input type="date" name="to" defaultValue={period.key.startsWith("days:") ? period.key.split(":")[2] : today} max={today} aria-label="종료일" className="w-auto" />
          <Button type="submit" variant="outline" size="sm">
            보기
          </Button>
        </form>
      </div>

      {!hasCount && (
        <p className="rounded-lg border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          이 기간에 끝난 실사가 없어 기록되지 않은 차이(과다 사용·분실)는 나타나지 않습니다. 기간 끝에 실사를 하면
          정확해집니다. 실사를 두 번 이상 하면 위에 실사 구간이 나타납니다.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="매출" value={won(revenue)} sub={`판매 ${sales.reduce((s, x) => s + x.quantity, 0).toLocaleString("ko-KR")}개`} />
        <SummaryCard
          label="이론 원가"
          value={won(summary.theoreticalCost)}
          sub={summary.theoreticalCostRate === null ? "레시피 기준" : `원가율 ${percent(summary.theoreticalCostRate)}`}
        />
        <SummaryCard
          label="실제 원가"
          value={won(summary.actualCost)}
          sub={summary.actualCostRate === null ? "실제로 줄어든 재료" : `원가율 ${percent(summary.actualCostRate)}`}
        />
        <SummaryCard
          label="차이"
          value={signedWon(summary.varianceCost)}
          sub="레시피보다 더 쓴 재료비"
          tone={summary.varianceCost > 0 ? "bad" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>품목별 차이</CardTitle>
          <CardDescription>
            차이 금액이 큰 순 · 금액은 최근 입고 단가 기준
            {causeTexts.length > 0 && ` · ${causeTexts.join(", ")}`}
            {summary.uncountedCount > 0 && ` · 이 기간에 세지 않은 품목 ${summary.uncountedCount}개는 실사 차이를 알 수 없습니다`}
            {summary.missingCostCount > 0 && ` · 입고 단가가 없는 품목 ${summary.missingCostCount}개는 금액에서 빠졌습니다`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">이 기간에 판매나 사용 기록이 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {lines.map((line) => (
                <AvtRow key={line.itemId} line={line} item={itemById.get(line.itemId)!} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "bad" }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-xl font-bold tabular-nums", tone === "bad" && "text-destructive")}>{value}</CardTitle>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardHeader>
    </Card>
  );
}

function AvtRow({ line, item }: { line: AvtLine; item: Item }) {
  const unit = item.units.find((u) => u.isDefaultPurchase) ?? null;
  const fmt = (n: number) => formatQuantity(n, item.baseUnit, unit);
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;
  const rate = line.varianceRate;
  const causes = [
    ["레시피 밖 사용", line.causes.consumed],
    ["폐기", line.causes.wasted],
    [line.causes.countLoss >= 0 ? "실사에서 모자람" : "실사에서 남음", line.causes.countLoss],
    ["직접 조정", line.causes.otherAdjust],
  ] as const;

  return (
    <li className="grid gap-1 py-3 text-sm">
      <div className="flex items-center gap-2">
        <Link href={`/items/${item.id}`} className="min-w-0 truncate font-medium hover:underline">
          {item.name}
        </Link>
        {rate !== null && rate >= ALERT_RATE && <Badge variant="destructive">차이 큼</Badge>}
        {!line.counted && <Badge variant="outline">실사 안 함</Badge>}
        <span
          className={cn(
            "ml-auto shrink-0 font-medium tabular-nums",
            line.varianceCost !== null && line.varianceCost > 0 && "text-destructive",
          )}
        >
          {line.varianceCost === null ? "단가 없음" : signedWon(line.varianceCost)}
        </span>
      </div>
      <p className="tabular-nums text-muted-foreground">
        이론 {fmt(line.theoretical)} · 실제 {fmt(line.actual)} · 차이{" "}
        <span
          className={cn(
            rate !== null && rate >= ALERT_RATE && "font-medium text-destructive",
            rate !== null && rate >= WARN_RATE && rate < ALERT_RATE && "font-medium text-amber-700 dark:text-amber-400",
          )}
        >
          {signed(line.variance)}
          {rate !== null && ` (${rate > 0 ? "+" : ""}${percent(rate)})`}
        </span>
      </p>
      {line.variance !== 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {causes
            .filter(([, q]) => q !== 0)
            .map(([label, q]) => `${label} ${label.startsWith("실사") ? fmt(Math.abs(q)) : signed(q)}`)
            .join(" · ")}
        </p>
      )}
    </li>
  );
}
