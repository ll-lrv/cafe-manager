import { can, menuProfitLines, POPULARITY_FACTOR, type MenuClass, type MenuProfitLine } from "@cafe/core";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLatestCosts, listMenus, type Menu } from "@/lib/api/menus";
import { getMenuSales } from "@/lib/api/reports";
import { requireCurrentStore } from "@/lib/api/stores";
import { cn } from "@/lib/utils";
import { menuCost, overTargetMenus } from "../../menus/menu-cost";
import { OverTargetList } from "../../menus/over-target-list";
import { resolvePeriods } from "../periods";
import { PeriodPicker, ReportTabs, signedWon, SummaryCard, won } from "../report-parts";

export const metadata: Metadata = { title: "메뉴 수익성" };

const CLASS_INFO: Record<MenuClass, { label: string; advice: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  star: { label: "효자 메뉴", advice: "많이 팔리고 개당 많이 남습니다. 품절 없이 지금처럼", variant: "default" },
  plowhorse: {
    label: "많이 팔리지만 덜 남음",
    advice: "개당 남는 게 평균보다 적습니다. 가격·레시피 양을 검토해 보세요",
    variant: "destructive",
  },
  puzzle: { label: "잘 남지만 덜 팔림", advice: "추천 메뉴로 알리거나 잘 보이는 곳에 두세요", variant: "secondary" },
  dog: { label: "정리 후보", advice: "덜 팔리고 덜 남습니다. 메뉴를 줄일 때 먼저 볼 메뉴", variant: "outline" },
};
const CLASS_ORDER: MenuClass[] = ["star", "plowhorse", "puzzle", "dog"];

const percentOf = (share: number) => `${Math.round(share * 100)}%`;

export default async function MenuProfitPage({ searchParams }: PageProps<"/reports/menus">) {
  const [params, store] = await Promise.all([searchParams, requireCurrentStore()]);
  if (!can(store.role, "report:view")) {
    return <p className="text-sm text-muted-foreground">리포트는 사장과 매니저만 볼 수 있습니다.</p>;
  }
  const periods = await resolvePeriods(store, params, { basePath: "/reports/menus", withCounts: false, defaultDays: 30 });
  const [menus, costs, sales] = await Promise.all([
    listMenus(store.storeId),
    getLatestCosts(store.storeId),
    getMenuSales(store.storeId, periods.period.range),
  ]);

  const menuById = new Map(menus.map((m) => [m.id, m]));
  const menuCosts = new Map(menus.map((m) => [m.id, menuCost(m, costs, store.targetCostRate)]));
  const { lines, summary } = menuProfitLines(
    menus.map((m) => {
      const c = menuCosts.get(m.id)!;
      return { menuId: m.id, unitCost: c.cost, costIncomplete: c.missing.length > 0, noRecipe: m.recipe.length === 0 };
    }),
    sales,
  );
  const classCounts = CLASS_ORDER.map((c) => [c, lines.filter((l) => l.class === c).length] as const);
  const hasClasses = classCounts.some(([, n]) => n > 0);
  const incomplete = lines.filter((l) => l.costIncomplete || l.noRecipe).length;

  // 지금 가격으로 목표 원가율을 넘는 메뉴 (기간과 상관없이)
  const overTarget = overTargetMenus(menus, costs, store.targetCostRate);

  return (
    <div className="grid gap-6">
      <ReportTabs active="/reports/menus" />
      <div>
        <h1 className="text-xl font-bold">메뉴 수익성</h1>
        <p className="text-sm text-muted-foreground">
          메뉴별로 매출에서 재료비를 뺀 마진이 큰 순입니다. 판매량과 개당 마진으로 많이 벌어 주는 메뉴와 많이 팔리지만
          남는 게 적은 메뉴를 나눕니다. 재료비는 지금 레시피와 최근 입고 단가 기준입니다.
        </p>
      </div>

      <PeriodPicker periods={periods} basePath="/reports/menus" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="매출" value={won(summary.revenue)} sub={`판매 ${summary.quantity.toLocaleString("ko-KR")}개`} />
        <SummaryCard
          label="재료비"
          value={won(summary.cost)}
          sub={summary.costRate === null ? "레시피 기준" : `원가율 ${summary.costRate}%`}
        />
        <SummaryCard label="마진" value={won(summary.margin)} sub="매출 − 재료비" tone={summary.margin < 0 ? "bad" : undefined} />
        <SummaryCard
          label="개당 평균 마진"
          value={summary.unitMarginThreshold === null ? "—" : won(summary.unitMarginThreshold)}
          sub="이보다 많으면 '많이 남음'"
        />
      </div>

      {overTarget.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>목표 원가율을 넘은 메뉴 {overTarget.length}개</CardTitle>
            <CardDescription>
              지금 가격 기준 · 목표를 맞추려면 이 가격 이상으로 팔아야 합니다 (100원 단위). 목표는 메뉴 정보 또는 매장 설정에서 바꿉니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OverTargetList items={overTarget} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>메뉴 순위</CardTitle>
          <CardDescription>
            마진이 큰 순 · 판매량이 메뉴 평균의 {Math.round(POPULARITY_FACTOR * 100)}% 이상이면 &lsquo;많이 팔림&rsquo;, 개당 마진이 평균 이상이면
            &lsquo;많이 남음&rsquo;
            {incomplete > 0 && ` · 레시피가 없거나 입고 단가를 모르는 재료가 있는 메뉴 ${incomplete}개는 재료비가 실제보다 적게 잡혔습니다`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">이 기간에 판매 기록이 없습니다.</p>
          ) : (
            <>
              {hasClasses && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {classCounts.map(([c, n]) => (
                    <li key={c} className="grid gap-0.5 rounded-lg border px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant={CLASS_INFO[c].variant}>{CLASS_INFO[c].label}</Badge>
                        <span className="ml-auto font-medium tabular-nums">{n}개</span>
                      </div>
                      <p className="text-muted-foreground">{CLASS_INFO[c].advice}</p>
                    </li>
                  ))}
                </ul>
              )}
              <ol className="divide-y">
                {lines.map((line, i) => (
                  <ProfitRow
                    key={line.menuId}
                    rank={i + 1}
                    line={line}
                    menu={menuById.get(line.menuId)!}
                    target={menuCosts.get(line.menuId)!.target}
                  />
                ))}
              </ol>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfitRow({ rank, line, menu, target }: { rank: number; line: MenuProfitLine; menu: Menu; target: number }) {
  const over = line.costRate !== null && line.costRate > target;
  return (
    <li className="grid gap-1 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-5 shrink-0 text-right text-muted-foreground tabular-nums">{rank}</span>
        <Link href={`/menus/${menu.id}`} className="min-w-0 truncate font-medium hover:underline">
          {menu.name}
        </Link>
        {line.class && <Badge variant={CLASS_INFO[line.class].variant}>{CLASS_INFO[line.class].label}</Badge>}
        {menu.archivedAt && <Badge variant="outline">보관됨</Badge>}
        {line.noRecipe ? (
          <Badge variant="outline">레시피 없음</Badge>
        ) : (
          line.costIncomplete && <Badge variant="outline">단가 모르는 재료</Badge>
        )}
        <span className={cn("ml-auto shrink-0 font-medium tabular-nums", line.margin < 0 && "text-destructive")}>
          {signedWon(line.margin)}
          {line.marginShare !== null && line.margin > 0 && (
            <span className="font-normal text-muted-foreground"> ({percentOf(line.marginShare)})</span>
          )}
        </span>
      </div>
      <p className="pl-7 tabular-nums text-muted-foreground">
        {line.quantity.toLocaleString("ko-KR")}개 · 매출 {won(line.revenue)}
        {line.unitMargin !== null && ` · 개당 마진 ${won(line.unitMargin)}`}
        {line.costRate !== null && (
          <>
            {" · 원가율 "}
            <span className={cn(over && "font-medium text-destructive")}>
              {line.costRate}%{over && ` (목표 ${target}%)`}
            </span>
          </>
        )}
      </p>
    </li>
  );
}
