import { can } from "@cafe/core";
import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCategories, listItems } from "@/lib/api/catalog";
import { getLatestCosts, getMenu } from "@/lib/api/menus";
import { requireCurrentStore } from "@/lib/api/stores";
import { activeItemsInCategoryOrder } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { BackLink } from "../back-link";
import { menuCost, won } from "../menu-cost";
import { ArchiveMenuButton, MenuForm, RecipeEditor } from "../menu-forms";

export const metadata: Metadata = { title: "메뉴 정보" };

export default async function MenuPage({ params, searchParams }: PageProps<"/menus/[id]">) {
  const [{ id }, { created }, store] = await Promise.all([params, searchParams, requireCurrentStore()]);
  const menu = await getMenu(store.storeId, id);
  if (!menu) notFound();
  const [items, categories, costs] = await Promise.all([
    listItems(store.storeId),
    listCategories(store.storeId),
    getLatestCosts(store.storeId),
  ]);
  const readOnly = !can(store.role, "catalog:manage");
  const { cost, rate, missing, target, overTarget, suggestedPrice } = menuCost(menu, costs, store.targetCostRate);
  const hasRecipe = menu.recipe.length > 0;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <BackLink />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{menu.name}</h1>
          {menu.archivedAt && <Badge variant="outline">보관됨</Badge>}
          {!readOnly && (
            <div className="ml-auto">
              <ArchiveMenuButton menuId={menu.id} archived={!!menu.archivedAt} />
            </div>
          )}
        </div>
      </div>

      {created && !hasRecipe && (
        <Alert>
          <CircleCheck />
          <AlertTitle>메뉴를 만들었습니다.</AlertTitle>
          <AlertDescription>
            아래에 레시피 재료를 넣어 주세요. 판매를 기록하면 재료가 재고에서 자동으로 차감됩니다.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "가격", value: won(menu.price) },
          { label: "원가", value: hasRecipe ? won(cost) : "—" },
          {
            label: "원가율",
            value: hasRecipe && rate !== null ? `${rate}%` : "—",
            sub: `목표 ${target}%${menu.targetCostRate === null ? " (매장 기본)" : ""}`,
            bad: overTarget,
          },
          {
            label: "목표 맞추는 판매가",
            value: hasRecipe && suggestedPrice !== null ? won(suggestedPrice) : "—",
            sub:
              suggestedPrice === null
                ? "원가를 알면 계산합니다"
                : overTarget
                  ? `지금보다 +${won(suggestedPrice - menu.price)}`
                  : "이 가격 이상이면 목표 안",
            bad: overTarget,
          },
        ].map((s) => (
          <Card key={s.label} size="sm">
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className={cn("text-lg font-bold tabular-nums", s.bad && "text-destructive")}>{s.value}</CardTitle>
              {s.sub && <p className={cn("text-xs text-muted-foreground", s.bad && "text-destructive")}>{s.sub}</p>}
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>레시피 (1개당)</CardTitle>
          <CardDescription>
            {missing.length > 0
              ? `${missing.join(", ")}은(는) 입고 단가 기록이 없어 원가에서 빠졌습니다. 입고할 때 단가를 입력하면 반영됩니다.`
              : "원가는 재료별 최근 입고 단가로 계산합니다."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecipeEditor
            menu={menu}
            items={activeItemsInCategoryOrder(items, categories)}
            costs={costs}
            readOnly={readOnly}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>메뉴 정보</CardTitle>
          {readOnly && <CardDescription>메뉴는 사장과 매니저만 바꿀 수 있습니다.</CardDescription>}
        </CardHeader>
        <CardContent>
          <MenuForm menu={menu} storeTargetRate={store.targetCostRate} readOnly={readOnly} />
        </CardContent>
      </Card>
    </div>
  );
}
