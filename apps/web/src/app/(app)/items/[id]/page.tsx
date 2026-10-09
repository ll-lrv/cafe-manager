import { can, DEFAULT_LEAD_DAYS, daysUntilEmpty, formatQuantity, roundQty, runoutLabel, stockStatus } from "@cafe/core";
import { ArrowRightLeft, CircleCheck } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CostChangeBadge, CostImpactList } from "@/components/cost-alerts";
import { ExpiryBadge, StockStatusBadge } from "@/components/stock-badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getItem, isItemInUse, listCategories } from "@/lib/api/catalog";
import { getLatestCosts, listCostChanges, listMenus } from "@/lib/api/menus";
import { getStockLevels, listLotLevels, listMovements } from "@/lib/api/stock";
import { listSuppliers } from "@/lib/api/suppliers";
import { requireCurrentStore } from "@/lib/api/stores";
import { buildCostAlerts, unitPriceText } from "@/lib/cost-alerts";
import { storeToday, toLotView } from "@/lib/inventory";
import { loadDailyUsage, loadIncoming } from "@/lib/item-usage";
import { itemReorderAdvice } from "@/lib/order-suggestions";
import { MovementList } from "../../stock/movement-list";
import { BackLink } from "../back-link";
import { ArchiveItemButton, ItemForm, UnitsEditor } from "../item-forms";

export const metadata: Metadata = { title: "품목 정보" };

export default async function ItemPage({ params, searchParams }: PageProps<"/items/[id]">) {
  const [{ id }, { created }, store] = await Promise.all([params, searchParams, requireCurrentStore()]);
  const [item, categories, suppliers] = await Promise.all([
    getItem(store.storeId, id),
    listCategories(store.storeId),
    listSuppliers(store.storeId),
  ]);
  if (!item) notFound();
  const canViewCosts = can(store.role, "report:view");
  const [inUse, stock, usageByItem, incoming, movements, lotLevels, costData] = await Promise.all([
    isItemInUse(item.id),
    getStockLevels(store.storeId),
    loadDailyUsage(store.storeId, store.timeZone),
    loadIncoming(store.storeId),
    listMovements(store.storeId, { itemId: item.id, limit: 10 }),
    item.trackExpiry ? listLotLevels(store.storeId, { itemId: item.id }) : Promise.resolve([]),
    canViewCosts
      ? Promise.all([listCostChanges(store.storeId, { itemId: item.id }), listMenus(store.storeId), getLatestCosts(store.storeId)])
      : Promise.resolve(null),
  ]);
  const latestCost = costData?.[2][item.id];
  // 가장 최근 단가 변동 (알림 기준보다 작아도 보여준다)
  const costChange = costData
    ? buildCostAlerts(costData[0], [item], costData[1], costData[2], { storeTargetRate: store.targetCostRate, notableOnly: false })[0]
    : undefined;
  const dayFormat = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: store.timeZone });
  const quantity = stock[item.id] ?? 0;
  const defaultUnit = item.units.find((u) => u.isDefaultPurchase) ?? null;
  const fmt = (n: number) => formatQuantity(n, item.baseUnit, defaultUnit);
  const today = storeToday(store.timeZone);
  const lots = lotLevels.map((l) => toLotView(l, today));
  // 로트 없이 들어오고 나간 양 (유통기한 관리를 나중에 켰거나, 로트보다 많이 쓴 경우)
  const withoutLot = roundQty(quantity - lots.reduce((sum, l) => sum + l.quantity, 0));

  const readOnly = !can(store.role, "catalog:manage");
  // 최근 사용량으로 본 소진 예상과 발주 시점 (기본 거래처의 입고까지 걸리는 날 기준)
  const usage = usageByItem[item.id] ?? null;
  const supplier = suppliers.find((s) => s.id === item.defaultSupplierId);
  const reorder = itemReorderAdvice(item, stock, usageByItem, supplier, incoming);
  const comingQuantity = incoming[item.id] ?? 0;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <BackLink />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{item.name}</h1>
          {item.archivedAt && <Badge variant="outline">보관됨</Badge>}
          {!readOnly && (
            <div className="ml-auto">
              <ArchiveItemButton itemId={item.id} archived={!!item.archivedAt} />
            </div>
          )}
        </div>
      </div>

      {created && item.units.length === 0 && (
        <Alert>
          <CircleCheck />
          <AlertTitle>품목을 만들었습니다.</AlertTitle>
          <AlertDescription>
            박스·봉처럼 묶음으로 들어오는 품목이면 아래에 입고 단위를 추가해 두세요. 입고할 때 묶음 수만 입력하면 됩니다.
          </AlertDescription>
        </Alert>
      )}

      {!item.archivedAt && (
        <Card>
          <CardHeader>
            <CardDescription>현재 재고</CardDescription>
            <CardTitle className="text-2xl font-bold">
              <span className="mr-2">{fmt(quantity)}</span>
              <span className="inline-flex align-middle">
                <StockStatusBadge status={stockStatus(quantity, item.minStock)} />
              </span>
            </CardTitle>
            {item.minStock > 0 && <CardDescription>부족 기준 {fmt(item.minStock)}</CardDescription>}
            {comingQuantity > 0 && <CardDescription>입고 예정 {fmt(comingQuantity)} (발주했지만 아직 안 들어온 양)</CardDescription>}
            {usage && (
              <CardDescription>
                하루 평균 {fmt(usage.perDay)} 사용 (최근 {usage.days}일) ·{" "}
                <span className={reorder.needed ? "font-medium text-destructive" : undefined}>
                  {runoutLabel(daysUntilEmpty(quantity, usage.perDay))}
                </span>
                {reorder.needed && ` · 지금 발주할 때 (입고까지 ${supplier?.leadDays ?? DEFAULT_LEAD_DAYS}일)`}
              </CardDescription>
            )}
            <CardAction>
              <Link href={`/stock?item=${item.id}`} className={buttonVariants()}>
                <ArrowRightLeft />
                입출고 기록
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            {item.trackExpiry && (lots.length > 0 || withoutLot !== 0) && (
              <section className="grid gap-2 rounded-lg bg-muted/50 p-3">
                <h2 className="text-sm font-medium">유통기한별 남은 양</h2>
                <ul className="grid gap-1.5 text-sm">
                  {lots.map((lot) => (
                    <li key={lot.lotId} className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">{lot.expiresOn ?? "유통기한 없음"}</span>
                      <ExpiryBadge status={lot.expiry} daysLeft={lot.daysLeft} />
                      <span className="ml-auto font-medium tabular-nums">{fmt(lot.quantity)}</span>
                    </li>
                  ))}
                  {withoutLot !== 0 && (
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <span>유통기한 기록 없음</span>
                      <span className="ml-auto tabular-nums">{fmt(withoutLot)}</span>
                    </li>
                  )}
                </ul>
              </section>
            )}
            <MovementList movements={movements} timeZone={store.timeZone} showItem={false} />
            {movements.length === 10 && (
              <Link href={`/stock?item=${item.id}`} className="block text-sm text-muted-foreground hover:underline">
                기록 더 보기
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {!item.archivedAt && latestCost !== undefined && (
        <Card>
          <CardHeader>
            <CardDescription>입고 단가 (최근 입고 기준)</CardDescription>
            <CardTitle className="text-lg font-bold tabular-nums">{unitPriceText(latestCost, item)}</CardTitle>
            {costChange && (
              <CardDescription className="flex flex-wrap items-center gap-1.5">
                <span>
                  {dayFormat.format(new Date(costChange.changedAt))}에 {costChange.priceBefore}에서
                </span>
                <CostChangeBadge percent={costChange.percent} />
              </CardDescription>
            )}
          </CardHeader>
          {costChange && (
            <CardContent className="grid gap-2">
              <h2 className="text-sm font-medium">이 변동으로 바뀐 메뉴 원가</h2>
              <CostImpactList alert={costChange} />
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>입고 단위</CardTitle>
          <CardDescription>
            예) 원두 1봉 = 1,000g, 우유 1박스 = 10,000ml. 재고는 항상 기본 단위로 계산됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UnitsEditor item={item} readOnly={readOnly} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>품목 정보</CardTitle>
          {readOnly && <CardDescription>품목 정보는 사장과 매니저만 바꿀 수 있습니다.</CardDescription>}
        </CardHeader>
        <CardContent>
          <ItemForm
            item={item}
            categories={categories}
            // 보관된 거래처라도 지금 지정돼 있으면 선택지에 남긴다.
            suppliers={suppliers.filter((s) => !s.archivedAt || s.id === item.defaultSupplierId)}
            baseUnitLocked={inUse}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>
    </div>
  );
}
