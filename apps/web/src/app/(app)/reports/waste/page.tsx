import { can, formatQuantity, wasteReasonLabel, wasteReport } from "@cafe/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listItems } from "@/lib/api/catalog";
import { getLatestCosts } from "@/lib/api/menus";
import { getMenuSales, getUsageTotals, getWasteTotals } from "@/lib/api/reports";
import { requireCurrentStore } from "@/lib/api/stores";
import { resolvePeriods } from "../periods";
import { PeriodPicker, ReportTabs, SummaryCard, won } from "../report-parts";

export const metadata: Metadata = { title: "폐기" };

const percent = (r: number) => `${(r * 100).toFixed(1)}%`;

export default async function WasteReportPage({ searchParams }: PageProps<"/reports/waste">) {
  const [params, store] = await Promise.all([searchParams, requireCurrentStore()]);
  if (!can(store.role, "report:view")) {
    return <p className="text-sm text-muted-foreground">리포트는 사장과 매니저만 볼 수 있습니다.</p>;
  }
  const periods = await resolvePeriods(store, params, { basePath: "/reports/waste", withCounts: false, defaultDays: 30 });
  const { range } = periods.period;
  const [items, wastes, usage, costs, sales] = await Promise.all([
    listItems(store.storeId),
    getWasteTotals(store.storeId, range),
    getUsageTotals(store.storeId, range),
    getLatestCosts(store.storeId),
    getMenuSales(store.storeId, range),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const salesAmount = sales.reduce((sum, s) => sum + s.amount, 0);
  const report = wasteReport({
    wastes: wastes.filter((w) => itemById.has(w.itemId)),
    usage: usage.filter((u) => itemById.has(u.itemId)),
    unitCosts: costs,
    salesAmount,
  });
  const fmt = (itemId: string, n: number) => {
    const item = itemById.get(itemId)!;
    return formatQuantity(n, item.baseUnit, item.units.find((u) => u.isDefaultPurchase) ?? null);
  };
  const noReason = report.byItem.some((l) => l.reasons.some((r) => r.reason === null));

  return (
    <div className="grid gap-6">
      <ReportTabs active="/reports/waste" />
      <div>
        <h1 className="text-xl font-bold">폐기</h1>
        <p className="text-sm text-muted-foreground">
          버린 재료의 금액과 사유입니다. 폐기율은 판매·사용·폐기로 나간 재료 금액 중 버린 비율입니다. 금액은 최근 입고 단가
          기준입니다. 폐기는 <Link href="/stock" className="underline">입출고</Link>에서 사유를 골라 기록합니다.
        </p>
      </div>

      <PeriodPicker periods={periods} basePath="/reports/waste" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <SummaryCard label="폐기 금액" value={won(report.wasteCost)} sub={`품목 ${report.byItem.length}개`} tone={report.wasteCost > 0 ? "bad" : undefined} />
        <SummaryCard
          label="폐기율"
          value={report.wasteRate === null ? "—" : percent(report.wasteRate)}
          sub={`나간 재료 ${won(report.outflowCost)} 중`}
        />
        <SummaryCard
          label="매출 대비"
          value={report.salesRate === null ? "—" : percent(report.salesRate)}
          sub={`매출 ${won(salesAmount)}`}
        />
      </div>

      {report.byItem.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          이 기간에 기록된 폐기가 없습니다.
        </p>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>사유별</CardTitle>
              <CardDescription>금액이 큰 순</CardDescription>
            </CardHeader>
            <CardContent>
              {report.byReason.length === 0 ? (
                <p className="text-sm text-muted-foreground">입고 단가가 있는 품목의 폐기가 없어 금액을 낼 수 없습니다.</p>
              ) : (
                <ul className="grid gap-3" aria-label="사유별 폐기">
                  {report.byReason.map((r) => (
                    <li key={r.reason ?? "none"} className="grid gap-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{wasteReasonLabel(r.reason)}</span>
                        <span className="ml-auto tabular-nums">{won(r.cost)}</span>
                        <span className="w-12 text-right tabular-nums text-muted-foreground">{Math.round(r.share * 100)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-destructive/70" style={{ width: `${r.share * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {noReason && (
                <p className="pt-3 text-xs text-muted-foreground">“사유 없음”은 사유를 고르기 전에 기록한 폐기입니다.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>품목별</CardTitle>
              <CardDescription>금액이 큰 순</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y" aria-label="품목별 폐기">
                {report.byItem.map((l) => (
                  <li key={l.itemId} className="grid gap-0.5 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Link href={`/items/${l.itemId}`} className="min-w-0 truncate font-medium hover:underline">
                        {itemById.get(l.itemId)!.name}
                      </Link>
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{fmt(l.itemId, l.quantity)}</span>
                      <span className="w-20 shrink-0 text-right tabular-nums">{l.cost === null ? "단가 없음" : won(l.cost)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {l.reasons.map((r) => `${wasteReasonLabel(r.reason)} ${fmt(l.itemId, r.quantity)}`).join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
              {report.missingCostItemIds.length > 0 && (
                <p className="pt-3 text-xs text-muted-foreground">
                  입고 단가가 없는 품목({report.missingCostItemIds.map((id) => itemById.get(id)!.name).join(", ")})은 금액에서
                  빠집니다. 입고할 때 단가를 넣어 주세요.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
