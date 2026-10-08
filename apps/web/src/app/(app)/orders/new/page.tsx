import { can } from "@cafe/core";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listItems } from "@/lib/api/catalog";
import { getLatestCosts } from "@/lib/api/menus";
import { getStockLevels } from "@/lib/api/stock";
import { requireCurrentStore } from "@/lib/api/stores";
import { listSuppliers } from "@/lib/api/suppliers";
import { loadDailyUsage } from "@/lib/item-usage";
import { buildOrderSuggestions } from "@/lib/order-suggestions";
import { NewOrderForm } from "../order-forms";

export const metadata: Metadata = { title: "새 발주" };

export default async function NewOrderPage({ searchParams }: PageProps<"/orders/new">) {
  const [{ supplier }, store] = await Promise.all([searchParams, requireCurrentStore()]);
  if (!can(store.role, "purchase:manage")) {
    return <p className="text-sm text-muted-foreground">발주는 사장과 매니저만 할 수 있습니다.</p>;
  }
  const [suppliers, items, stock, costs, usage] = await Promise.all([
    listSuppliers(store.storeId),
    listItems(store.storeId),
    getStockLevels(store.storeId),
    getLatestCosts(store.storeId),
    loadDailyUsage(store.storeId, store.timeZone),
  ]);
  const active = suppliers.filter((s) => !s.archivedAt);
  const suggestionCounts = Object.fromEntries(
    active.map((s) => [s.id, buildOrderSuggestions(items, stock, costs, usage, s).length]),
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/orders" className="flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          발주
        </Link>
        <h1 className="text-xl font-bold">새 발주</h1>
      </div>
      <Card>
        <CardContent>
          {active.length === 0 ? (
            <div className="grid gap-3 text-sm text-muted-foreground">
              <p>먼저 거래처를 등록해 주세요.</p>
              <Link href="/suppliers/new?next=/orders/new" className={buttonVariants({ className: "w-fit" })}>
                거래처 추가
              </Link>
            </div>
          ) : (
            <NewOrderForm
              suppliers={active}
              suggestionCounts={suggestionCounts}
              initialSupplierId={typeof supplier === "string" ? supplier : undefined}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
