import { can, COST_ALERT_DAYS, COST_ALERT_PERCENT, EXPIRY_SOON_DAYS, formatQuantity } from "@cafe/core";
import { ArrowRightLeft, ClipboardList, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CostAlertList } from "@/components/cost-alerts";
import { ActionButton } from "@/components/form-parts";
import { ExpiryBadge, StockStatusBadge } from "@/components/stock-badges";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listItems } from "@/lib/api/catalog";
import { listStockCounts } from "@/lib/api/counts";
import { getLatestCosts, listCostChanges, listMenus } from "@/lib/api/menus";
import { listPurchaseOrders } from "@/lib/api/purchasing";
import { listSales } from "@/lib/api/sales";
import { getStockLevels, listLotLevels, listMovements } from "@/lib/api/stock";
import { requireCurrentStore } from "@/lib/api/stores";
import { requireUser } from "@/lib/api/session";
import { buildCostAlerts } from "@/lib/cost-alerts";
import { buildItemLevels, storeDayRange, storeToday, toLotView } from "@/lib/inventory";
import { overTargetMenus } from "../menus/menu-cost";
import { OverTargetList } from "../menus/over-target-list";
import { dayLabel } from "../orders/status";
import { MovementList } from "../stock/movement-list";
import { applyTemplateAction } from "./actions";

export const metadata: Metadata = { title: "대시보드" };


/** 대시보드 목록은 이 개수까지만 보여주고 나머지는 "모두 보기"로 */
const LIMIT = 6;

function MoreLink({ href, total }: { href: string; total: number }) {
  if (total <= LIMIT) return null;
  return (
    <Link href={href} className="block pt-2 text-sm text-muted-foreground hover:underline">
      {total - LIMIT}개 더 보기
    </Link>
  );
}

export default async function DashboardPage() {
  const [user, store] = await Promise.all([requireUser(), requireCurrentStore()]);
  const today = storeToday(store.timeZone);
  const canPurchase = can(store.role, "purchase:manage");
  const canViewCosts = can(store.role, "report:view");
  const [items, stock, lotLevels, movements, todaySales, counts, incoming, costData] = await Promise.all([
    listItems(store.storeId),
    getStockLevels(store.storeId),
    listLotLevels(store.storeId),
    listMovements(store.storeId, { limit: 5 }),
    listSales(store.storeId, storeDayRange(today, store.timeZone)),
    listStockCounts(store.storeId, 1),
    canPurchase ? listPurchaseOrders(store.storeId, { statuses: ["ordered", "partially_received"] }) : Promise.resolve([]),
    canViewCosts
      ? Promise.all([listCostChanges(store.storeId, { withinDays: COST_ALERT_DAYS }), listMenus(store.storeId), getLatestCosts(store.storeId)])
      : Promise.resolve(null),
  ]);
  // 입고 예정일 순 (없으면 뒤로)
  const incomingSorted = [...incoming].sort((a, b) => (a.expectedOn ?? "9999").localeCompare(b.expectedOn ?? "9999"));
  const countInProgress = counts.find((c) => c.status === "in_progress");
  const todayCount = todaySales.reduce((sum, s) => sum + s.quantity, 0);
  const todayAmount = todaySales.reduce((sum, s) => sum + s.amount, 0);

  const activeItems = items.filter((i) => !i.archivedAt);
  // 최근 바뀐 입고 단가 (알림 기준 이상). 메뉴 원가율이 어떻게 바뀌었는지 함께 보여준다.
  // 지금 가격으로 목표 원가율을 넘는 메뉴 (단가가 올라 마진이 줄었거나 가격이 낮게 잡힌 메뉴)
  const overTarget = costData ? overTargetMenus(costData[1], costData[2], store.targetCostRate) : [];
  const costAlerts = costData ? buildCostAlerts(costData[0], items, costData[1], costData[2], { storeTargetRate: store.targetCostRate }) : [];
  const itemById = new Map(activeItems.map((i) => [i.id, i]));
  const levels = buildItemLevels(activeItems, stock, lotLevels, today);
  const fmt = (itemId: string, n: number) => {
    const item = itemById.get(itemId)!;
    return formatQuantity(n, item.baseUnit, item.units.find((u) => u.isDefaultPurchase) ?? null);
  };

  // 재고 없음 → 부족 순
  const lowItems = activeItems
    .filter((i) => levels[i.id]?.status !== "ok")
    .sort((a, b) => Number(levels[b.id]?.status === "out") - Number(levels[a.id]?.status === "out"));
  // 로트 단위로 지남·임박 (기한이 빠른 순으로 들어온다)
  const expiringLots = lotLevels
    .filter((l) => itemById.has(l.itemId))
    .map((l) => toLotView(l, today))
    .filter((l) => l.expiry === "expired" || l.expiry === "soon");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-bold">안녕하세요, {user.displayName}님</h1>
          <p className="text-sm text-muted-foreground">{store.storeName}의 오늘 현황입니다.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/stock" className={buttonVariants({ variant: "outline" })}>
            <ArrowRightLeft />
            입출고
          </Link>
          <Link href="/sales" className={buttonVariants()}>
            <Receipt />
            판매 입력
          </Link>
        </div>
      </div>

      {countInProgress && (
        <Link href={`/counts/${countInProgress.id}`} className="block">
          <Card size="sm" className="transition-colors hover:bg-muted/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ClipboardList className="size-4 text-primary" />
                <CardTitle>재고 실사 진행 중</CardTitle>
              </div>
              <CardDescription>
                {countInProgress.categoryName ?? "전체 품목"} · {countInProgress.countedCount}/{countInProgress.lineCount}개 셈
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      )}

      <Link href="/sales" className="block">
        <Card size="sm" className="transition-colors hover:bg-muted/50">
          <CardHeader>
            <CardDescription>오늘 매출</CardDescription>
            <CardTitle className="text-2xl font-bold tabular-nums">{todayAmount.toLocaleString("ko-KR")}원</CardTitle>
            <CardAction className="text-sm text-muted-foreground tabular-nums">
              {todayCount.toLocaleString("ko-KR")}개 판매
            </CardAction>
          </CardHeader>
        </Card>
      </Link>

      {activeItems.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>품목을 등록해 주세요</CardTitle>
            <CardDescription>
              원두, 우유, 컵처럼 재고로 관리할 물품을 등록하면 이곳에 재고 현황이 나타납니다.
              {can(store.role, "catalog:manage") &&
                " 카페 기본 템플릿을 불러오면 자주 쓰는 품목과 메뉴·레시피가 한 번에 들어갑니다."}
            </CardDescription>
            {can(store.role, "catalog:manage") && (
              <CardAction className="flex flex-wrap justify-end gap-2">
                <ActionButton action={applyTemplateAction} fields={{}} pendingText="불러오는 중…">
                  기본 템플릿 불러오기
                </ActionButton>
                <Link href="/items/new" className={buttonVariants({ variant: "outline" })}>
                  품목 추가
                </Link>
              </CardAction>
            )}
          </CardHeader>
        </Card>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>부족한 품목 {lowItems.length}개</CardTitle>
              <CardDescription>재고가 없거나 부족 알림 기준 이하인 품목</CardDescription>
            </CardHeader>
            <CardContent>
              {lowItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">부족한 품목이 없습니다.</p>
              ) : (
                <>
                  <ul className="divide-y">
                    {lowItems.slice(0, LIMIT).map((item) => (
                      <li key={item.id}>
                        <Link href={`/items/${item.id}`} className="flex items-center gap-2 py-2 text-sm hover:underline">
                          <span className="min-w-0 truncate font-medium">{item.name}</span>
                          <StockStatusBadge status={levels[item.id]!.status} />
                          <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                            {fmt(item.id, levels[item.id]!.quantity)}
                            {item.minStock > 0 && ` / ${fmt(item.id, item.minStock)}`}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <MoreLink href="/items?status=low" total={lowItems.length} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>유통기한 확인 {expiringLots.length}건</CardTitle>
              <CardDescription>지났거나 {EXPIRY_SOON_DAYS}일 안에 끝나는 재고</CardDescription>
            </CardHeader>
            <CardContent>
              {expiringLots.length === 0 ? (
                <p className="text-sm text-muted-foreground">유통기한이 임박한 재고가 없습니다.</p>
              ) : (
                <>
                  <ul className="divide-y">
                    {expiringLots.slice(0, LIMIT).map((lot) => (
                      <li key={lot.lotId}>
                        <Link href={`/items/${lot.itemId}`} className="flex items-center gap-2 py-2 text-sm hover:underline">
                          <span className="min-w-0 truncate font-medium">{itemById.get(lot.itemId)!.name}</span>
                          <ExpiryBadge status={lot.expiry} daysLeft={lot.daysLeft} />
                          <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                            {fmt(lot.itemId, lot.quantity)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <MoreLink href="/items?status=expiry" total={expiringLots.length} />
                </>
              )}
            </CardContent>
          </Card>

          {costAlerts.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>입고 단가 변동 {costAlerts.length}건</CardTitle>
                <CardDescription>
                  최근 {COST_ALERT_DAYS}일 동안 직전 입고보다 {COST_ALERT_PERCENT}% 이상 바뀐 단가와 메뉴 원가율 변화
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CostAlertList alerts={costAlerts.slice(0, LIMIT)} timeZone={store.timeZone} />
                {costAlerts.length > LIMIT && (
                  <p className="pt-2 text-sm text-muted-foreground">외 {costAlerts.length - LIMIT}건</p>
                )}
              </CardContent>
            </Card>
          )}

          {overTarget.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>목표 원가율을 넘은 메뉴 {overTarget.length}개</CardTitle>
                <CardDescription>지금 가격 기준 · 목표를 맞추려면 오른쪽 가격 이상으로 팔아야 합니다</CardDescription>
                <CardAction>
                  <Link href="/reports/menus" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    메뉴 수익성
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                <OverTargetList items={overTarget.slice(0, LIMIT)} />
                {overTarget.length > LIMIT && (
                  <p className="pt-2 text-sm text-muted-foreground">외 {overTarget.length - LIMIT}개</p>
                )}
              </CardContent>
            </Card>
          )}

          {canPurchase && incomingSorted.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>입고 예정 {incomingSorted.length}건</CardTitle>
                <CardAction>
                  <Link href="/orders" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    발주 보기
                  </Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {incomingSorted.slice(0, LIMIT).map((o) => (
                    <li key={o.id}>
                      <Link href={`/orders/${o.id}`} className="flex items-center gap-2 py-2 text-sm hover:underline">
                        <span className="font-medium">{o.supplierName}</span>
                        <span className="min-w-0 truncate text-muted-foreground">
                          {o.lines.map((l) => l.itemName).join(", ")}
                        </span>
                        <span
                          className={`ml-auto shrink-0 tabular-nums ${o.expectedOn && o.expectedOn < today ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {o.expectedOn ? dayLabel(o.expectedOn) : "날짜 미정"}
                          {o.status === "partially_received" && " · 일부 입고"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>최근 기록</CardTitle>
              <CardAction>
                <Link href="/stock" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  모두 보기
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent>
              <MovementList movements={movements} timeZone={store.timeZone} />
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
