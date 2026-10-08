import { can } from "@cafe/core";
import { ChevronLeft, ChevronRight, FileUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listItems } from "@/lib/api/catalog";
import { listMenus } from "@/lib/api/menus";
import { listOptions, toOptionRules } from "@/lib/api/options";
import { listSales } from "@/lib/api/sales";
import { getStockLevels } from "@/lib/api/stock";
import { requireCurrentStore } from "@/lib/api/stores";
import { addDays, isValidDate, storeDayRange, storeToday } from "@/lib/inventory";
import { SaleList, SalesForm, type ItemInfo } from "./sales-form";

export const metadata: Metadata = { title: "판매" };

const dateLabel = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" });

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  const [{ date: dateParam }, store] = await Promise.all([searchParams, requireCurrentStore()]);
  const today = storeToday(store.timeZone);
  // 미래 날짜나 잘못된 값은 오늘로
  const date = isValidDate(dateParam) && dateParam <= today ? dateParam : today;
  const isToday = date === today;

  const [menus, items, stock, sales, options] = await Promise.all([
    listMenus(store.storeId),
    listItems(store.storeId),
    getStockLevels(store.storeId),
    listSales(store.storeId, storeDayRange(date, store.timeZone)),
    listOptions(store.storeId),
  ]);

  const activeMenus = menus.filter((m) => !m.archivedAt);
  const itemInfo: Record<string, ItemInfo> = Object.fromEntries(
    items.map((i) => [
      i.id,
      { name: i.name, baseUnit: i.baseUnit, defaultUnit: i.units.find((u) => u.isDefaultPurchase) ?? null },
    ]),
  );

  const totalCount = sales.reduce((sum, s) => sum + s.quantity, 0);
  const totalAmount = sales.reduce((sum, s) => sum + s.amount, 0);
  // 메뉴별 합계 (많이 팔린 순)
  const byMenu = [
    ...sales
      .reduce((map, s) => {
        const prev = map.get(s.menuId) ?? { name: s.menuName, quantity: 0, amount: 0 };
        return map.set(s.menuId, { ...prev, quantity: prev.quantity + s.quantity, amount: prev.amount + s.amount });
      }, new Map<string, { name: string; quantity: number; amount: number }>())
      .values(),
  ].sort((a, b) => b.quantity - a.quantity);

  const title = isToday ? "오늘" : dateLabel.format(new Date(`${date}T00:00:00Z`));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-bold">판매</h1>
          <p className="text-sm text-muted-foreground">
            판매 수량을 기록하면 레시피대로 재료가 재고에서 차감됩니다. 하루 마감 때 한 번에 입력해도 됩니다.
          </p>
        </div>
        <nav className="flex items-center gap-1" aria-label="날짜 이동">
          <Link
            href={`/sales?date=${addDays(date, -1)}`}
            className={buttonVariants({ variant: "outline", size: "icon" })}
            aria-label="전날"
          >
            <ChevronLeft />
          </Link>
          <span className="min-w-24 text-center text-sm font-medium">{title}</span>
          {isToday ? (
            <span className="size-8" />
          ) : (
            <Link
              href={`/sales?date=${addDays(date, 1)}`}
              className={buttonVariants({ variant: "outline", size: "icon" })}
              aria-label="다음 날"
            >
              <ChevronRight />
            </Link>
          )}
          {!isToday && (
            <Link href="/sales" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              오늘
            </Link>
          )}
        </nav>
        {can(store.role, "sale:import") && (
          <Link href="/sales/import" className={buttonVariants({ variant: "outline" })}>
            <FileUp />
            CSV 가져오기
          </Link>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{title} 판매 입력</CardTitle>
            {!isToday && <CardDescription>지난 날짜는 그 날 마감 시각으로 기록됩니다.</CardDescription>}
          </CardHeader>
          <CardContent>
            {activeMenus.length === 0 ? (
              <div className="grid gap-3 text-sm text-muted-foreground">
                <p>먼저 메뉴를 등록해 주세요.</p>
                {can(store.role, "catalog:manage") && (
                  <Link href="/menus/new" className={buttonVariants({ className: "w-fit" })}>
                    메뉴 추가
                  </Link>
                )}
              </div>
            ) : (
              <SalesForm
                // 날짜를 바꾸면 입력 중인 수량을 비우고 다시 시작한다.
                key={date}
                menus={activeMenus}
                options={options
                  .filter((o) => !o.archivedAt)
                  .map((o) => ({ id: o.id, name: o.name, price: o.price, rules: toOptionRules(o) }))}
                items={itemInfo}
                stock={stock}
                date={date}
                isToday={isToday}
              />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardDescription>{title} 매출</CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums">
                {totalAmount.toLocaleString("ko-KR")}원
              </CardTitle>
              <CardAction className="text-sm text-muted-foreground tabular-nums">
                {totalCount.toLocaleString("ko-KR")}개 판매
              </CardAction>
            </CardHeader>
            {byMenu.length > 0 && (
              <CardContent>
                <ul className="grid gap-1 text-sm">
                  {byMenu.map((m) => (
                    <li key={m.name} className="flex gap-2">
                      <span>{m.name}</span>
                      <span className="tabular-nums text-muted-foreground">{m.quantity.toLocaleString("ko-KR")}개</span>
                      <span className="ml-auto tabular-nums">{m.amount.toLocaleString("ko-KR")}원</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>판매 기록</CardTitle>
              {can(store.role, "sale:cancel") && (
                <CardDescription>잘못 입력한 판매는 취소하면 차감된 재료도 되돌아갑니다.</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <SaleList sales={sales} canCancel={can(store.role, "sale:cancel")} timeZone={store.timeZone} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
