import { can } from "@cafe/core";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listCategories, listItems } from "@/lib/api/catalog";
import { getStockLevels, listMovements } from "@/lib/api/stock";
import { requireCurrentStore } from "@/lib/api/stores";
import { MovementList } from "./movement-list";
import { StockForm, type StockItem } from "./stock-form";

export const metadata: Metadata = { title: "입출고" };

export default async function StockPage({ searchParams }: PageProps<"/stock">) {
  const [{ item: itemParam }, store] = await Promise.all([searchParams, requireCurrentStore()]);
  const selectedItemId = typeof itemParam === "string" ? itemParam : undefined;

  const [allItems, categories, stock, movements] = await Promise.all([
    listItems(store.storeId),
    listCategories(store.storeId),
    getStockLevels(store.storeId),
    listMovements(store.storeId, { itemId: selectedItemId }),
  ]);

  // 보관 품목은 빼고, 카테고리 순서 → 이름 순 (미분류는 맨 뒤)
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const items: StockItem[] = allItems
    .filter((i) => !i.archivedAt)
    .sort((a, b) => {
      const ca = a.categoryId ? (order.get(a.categoryId) ?? 0) : Infinity;
      const cb = b.categoryId ? (order.get(b.categoryId) ?? 0) : Infinity;
      return ca === cb ? a.name.localeCompare(b.name, "ko") : ca - cb;
    });
  const selectedItem = allItems.find((i) => i.id === selectedItemId);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-bold">입출고</h1>
        <p className="text-sm text-muted-foreground">들어오고 나간 재고를 기록합니다. 기록은 고치지 않고 조정으로 바로잡습니다.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>기록하기</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="grid gap-3 text-sm text-muted-foreground">
                <p>먼저 품목을 등록해 주세요.</p>
                {can(store.role, "catalog:manage") && (
                  <Link href="/items/new" className={buttonVariants({ className: "w-fit" })}>
                    품목 추가
                  </Link>
                )}
              </div>
            ) : (
              <StockForm
                // 품목 링크로 들어오면 그 품목이 선택된 상태로 다시 시작한다.
                key={selectedItemId ?? "all"}
                items={items}
                stock={stock}
                canAdjust={can(store.role, "stock:adjust")}
                initialItemId={selectedItemId}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedItem ? `${selectedItem.name} 기록` : "최근 기록"}</CardTitle>
            {selectedItem && (
              <CardAction>
                <Link href="/stock" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  전체 보기
                </Link>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <MovementList movements={movements} showItem={!selectedItem} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
