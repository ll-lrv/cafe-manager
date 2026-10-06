import { can, EXPIRY_SOON_DAYS, formatQuantity } from "@cafe/core";
import { ArrowRightLeft, ClipboardList, Receipt, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExpiryBadge, StockStatusBadge } from "@/components/stock-badges";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listItems } from "@/lib/api/catalog";
import { getStockLevels, listLotLevels, listMovements } from "@/lib/api/stock";
import { requireCurrentStore } from "@/lib/api/stores";
import { requireUser } from "@/lib/api/session";
import { buildItemLevels, storeToday, toLotView } from "@/lib/inventory";
import { MovementList } from "../stock/movement-list";

export const metadata: Metadata = { title: "대시보드" };

const UPCOMING = [
  { icon: Receipt, title: "메뉴·판매", description: "레시피 등록, 판매 입력 시 재료 자동 차감" },
  { icon: ClipboardList, title: "재고 실사", description: "실제 수량을 세서 장부와 맞추기" },
  { icon: Truck, title: "거래처·발주", description: "발주서 작성, 입고 처리" },
];

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
  const [items, stock, lotLevels, movements] = await Promise.all([
    listItems(store.storeId),
    getStockLevels(store.storeId),
    listLotLevels(store.storeId),
    listMovements(store.storeId, { limit: 5 }),
  ]);

  const today = storeToday();
  const activeItems = items.filter((i) => !i.archivedAt);
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
        <Link href="/stock" className={buttonVariants()}>
          <ArrowRightLeft />
          입출고 기록
        </Link>
      </div>

      {activeItems.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>품목을 등록해 주세요</CardTitle>
            <CardDescription>원두, 우유, 컵처럼 재고로 관리할 물품을 등록하면 이곳에 재고 현황이 나타납니다.</CardDescription>
            {can(store.role, "catalog:manage") && (
              <CardAction>
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
              <MovementList movements={movements} />
            </CardContent>
          </Card>
        </div>
      )}

      <section className="grid gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">곧 추가될 기능</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {UPCOMING.map(({ icon: Icon, title, description }) => (
            <Card key={title} size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" />
                  <CardTitle>{title}</CardTitle>
                  <Badge variant="outline" className="ml-auto">
                    준비 중
                  </Badge>
                </div>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
