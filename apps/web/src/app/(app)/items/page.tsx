import { can } from "@cafe/core";
import { Plus, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { listCategories, listItems } from "@/lib/api/catalog";
import { getStockLevels, listLotLevels } from "@/lib/api/stock";
import { requireCurrentStore } from "@/lib/api/stores";
import { buildItemLevels, storeToday } from "@/lib/inventory";
import { loadDailyUsage } from "@/lib/item-usage";
import { ItemList, type StatusFilter } from "./item-list";

export const metadata: Metadata = { title: "품목·재고" };

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
  const [{ status }, store] = await Promise.all([searchParams, requireCurrentStore()]);
  const [items, categories, stock, lots, usage] = await Promise.all([
    listItems(store.storeId),
    listCategories(store.storeId),
    getStockLevels(store.storeId),
    listLotLevels(store.storeId),
    loadDailyUsage(store.storeId, store.timeZone),
  ]);
  const levels = buildItemLevels(items, stock, lots, storeToday(store.timeZone), usage);
  const initialStatus: StatusFilter = status === "low" || status === "runout" || status === "expiry" ? status : "all";
  const canManage = can(store.role, "catalog:manage");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-bold">품목·재고</h1>
          <p className="text-sm text-muted-foreground">원두, 우유, 컵처럼 재고로 관리하는 물품과 현재 재고입니다.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Link href="/items/categories" className={buttonVariants({ variant: "outline" })}>
              <Tags />
              카테고리
            </Link>
            <Link href="/items/new" className={buttonVariants()}>
              <Plus />
              품목 추가
            </Link>
          </div>
        )}
      </div>
      {/* 대시보드에서 상태 필터를 바꿔 들어오면 그 상태로 다시 시작한다. */}
      <ItemList key={initialStatus} items={items} categories={categories} levels={levels} initialStatus={initialStatus} />
    </div>
  );
}
