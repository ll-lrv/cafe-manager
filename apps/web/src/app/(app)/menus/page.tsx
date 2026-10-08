import { can, formatQuantity } from "@cafe/core";
import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getLatestCosts, listMenus } from "@/lib/api/menus";
import { requireCurrentStore } from "@/lib/api/stores";
import { cn } from "@/lib/utils";
import { menuCost, won } from "./menu-cost";

export const metadata: Metadata = { title: "메뉴" };

export default async function MenusPage({ searchParams }: PageProps<"/menus">) {
  const [{ archived }, store] = await Promise.all([searchParams, requireCurrentStore()]);
  const showArchived = archived === "1";
  const [menus, costs] = await Promise.all([listMenus(store.storeId), getLatestCosts(store.storeId)]);
  const visible = menus.filter((m) => showArchived || !m.archivedAt);
  const archivedCount = menus.filter((m) => m.archivedAt).length;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-bold">메뉴</h1>
          <p className="text-sm text-muted-foreground">
            레시피를 등록하면 판매할 때 재료가 자동으로 차감되고, 최근 입고 단가로 원가를 계산합니다.
          </p>
        </div>
        {can(store.role, "catalog:manage") && (
          <Link href="/menus/new" className={buttonVariants()}>
            <Plus />
            메뉴 추가
          </Link>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 등록한 메뉴가 없습니다.
        </p>
      ) : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {visible.map((menu) => {
            const { cost, rate, missing, overTarget, target } = menuCost(menu, costs, store.targetCostRate);
            return (
              <li key={menu.id}>
                <Link
                  href={`/menus/${menu.id}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                    menu.archivedAt && "opacity-60",
                  )}
                >
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{menu.name}</span>
                      {menu.archivedAt && <Badge variant="outline">보관됨</Badge>}
                      {menu.recipe.length === 0 && <Badge variant="destructive">레시피 없음</Badge>}
                      {overTarget && <Badge variant="destructive">목표 {target}% 초과</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {menu.recipe.map((r) => `${r.itemName} ${formatQuantity(r.quantity, r.baseUnit)}`).join(" · ")}
                    </p>
                  </div>
                  <div className="grid shrink-0 justify-items-end gap-0.5 text-right text-sm">
                    <span className="font-medium tabular-nums">{won(menu.price)}</span>
                    {menu.recipe.length > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        원가 {won(cost)}
                        {missing.length > 0 && "+"}
                        {rate !== null && ` · ${rate}%`}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {archivedCount > 0 && (
        <Link
          href={showArchived ? "/menus" : "/menus?archived=1"}
          className="w-fit text-sm text-muted-foreground hover:underline"
        >
          {showArchived ? "보관된 메뉴 숨기기" : `보관된 메뉴도 보기 (${archivedCount}개)`}
        </Link>
      )}
    </div>
  );
}
