import { avtLine, avtSummary, can, formatQuantity, sortAvtLines, type AvtLine } from "@cafe/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listItems, type Item } from "@/lib/api/catalog";
import { getLatestCosts } from "@/lib/api/menus";
import { getMenuSales, getUsageTotals } from "@/lib/api/reports";
import { requireCurrentStore } from "@/lib/api/stores";
import { cn } from "@/lib/utils";
import { resolvePeriods } from "./periods";
import { PeriodPicker, ReportTabs, signedWon, SummaryCard, won } from "./report-parts";

export const metadata: Metadata = { title: "이론 vs 실제" };

/** 차이율이 이 이상이면 눈에 띄게 표시한다 */
const WARN_RATE = 0.05;
const ALERT_RATE = 0.1;

const percent = (r: number) => `${(r * 100).toFixed(1)}%`;

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const [params, store] = await Promise.all([searchParams, requireCurrentStore()]);
  if (!can(store.role, "report:view")) {
    return <p className="text-sm text-muted-foreground">리포트는 사장과 매니저만 볼 수 있습니다.</p>;
  }
  const periods = await resolvePeriods(store, params, { basePath: "/reports", withCounts: true, defaultDays: 7 });
  const { period } = periods;

  const [items, totals, costs, sales] = await Promise.all([
    listItems(store.storeId),
    getUsageTotals(store.storeId, period.range),
    getLatestCosts(store.storeId),
    getMenuSales(store.storeId, period.range),
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
  const hasCount = periods.completedCounts.some((c) => inRange(c.completedAt));
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
      <ReportTabs active="/reports" />
      <div>
        <h1 className="text-xl font-bold">이론 vs 실제 사용량</h1>
        <p className="text-sm text-muted-foreground">
          레시피대로라면 쓰였어야 할 양(이론)과 실제로 줄어든 양을 비교합니다. 차이가 크면 레시피보다 많이 담았거나,
          기록하지 않은 사용·폐기·분실이 있었다는 뜻입니다.
        </p>
      </div>

      <PeriodPicker periods={periods} basePath="/reports" />

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
