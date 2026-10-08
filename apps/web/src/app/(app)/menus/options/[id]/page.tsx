import { applyOptions, can } from "@cafe/core";
import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCategories, listItems } from "@/lib/api/catalog";
import { getLatestCosts, listMenus } from "@/lib/api/menus";
import { getOption, toOptionRules } from "@/lib/api/options";
import { requireCurrentStore } from "@/lib/api/stores";
import { activeItemsInCategoryOrder } from "@/lib/inventory";
import { BackLink } from "../../back-link";
import { optionSetCost, won } from "../../menu-cost";
import { ArchiveOptionButton, OptionForm, RuleEditor } from "../option-forms";

export const metadata: Metadata = { title: "옵션 정보" };

const signedWon = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("ko-KR")}원`;

export default async function OptionPage({ params, searchParams }: PageProps<"/menus/options/[id]">) {
  const [{ id }, { created }, store] = await Promise.all([params, searchParams, requireCurrentStore()]);
  const option = await getOption(store.storeId, id);
  if (!option) notFound();
  const [items, categories, menus, costs] = await Promise.all([
    listItems(store.storeId),
    listCategories(store.storeId),
    listMenus(store.storeId),
    getLatestCosts(store.storeId),
  ]);
  const readOnly = !can(store.role, "catalog:manage");

  // 이 옵션을 붙이면 재료가 바뀌는 메뉴와 원가 변화
  const rules = toOptionRules(option);
  const effects = menus
    .filter((m) => !m.archivedAt && m.recipe.length > 0)
    .flatMap((m) => {
      if (JSON.stringify(applyOptions(m.recipe, [])) === JSON.stringify(applyOptions(m.recipe, rules))) return [];
      const base = optionSetCost(m, [], costs).cost;
      const after = optionSetCost(m, [option], costs);
      return [{ menu: m, base, after: after.cost, incomplete: after.incomplete }];
    });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <BackLink href="/menus/options" label="옵션 목록" />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{option.name}</h1>
          {option.archivedAt && <Badge variant="outline">보관됨</Badge>}
          {!readOnly && (
            <div className="ml-auto">
              <ArchiveOptionButton optionId={option.id} archived={!!option.archivedAt} />
            </div>
          )}
        </div>
      </div>

      {created && option.rules.length === 0 && (
        <Alert>
          <CircleCheck />
          <AlertTitle>옵션을 만들었습니다.</AlertTitle>
          <AlertDescription>아래에 재료 규칙을 넣어 주세요. 판매할 때 이 옵션을 붙이면 규칙대로 재료가 차감됩니다.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>재료 규칙 (1개당)</CardTitle>
          <CardDescription>
            늘리기 → 바꾸기 → 추가 순서로 적용합니다. 메뉴 레시피에 없는 재료를 바꾸거나 늘리는 규칙은 그 메뉴에는 아무것도 하지
            않습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RuleEditor option={option} items={activeItemsInCategoryOrder(items, categories)} readOnly={readOnly} />
        </CardContent>
      </Card>

      {option.rules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>메뉴별 원가 변화</CardTitle>
            <CardDescription>이 옵션을 붙이면 재료가 바뀌는 메뉴 · 최근 입고 단가 기준</CardDescription>
          </CardHeader>
          <CardContent>
            {effects.length === 0 ? (
              <p className="text-sm text-muted-foreground">이 옵션으로 재료가 바뀌는 메뉴가 없습니다.</p>
            ) : (
              <ul className="divide-y">
                {effects.map((e) => (
                  <li key={e.menu.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
                    <Link href={`/menus/${e.menu.id}`} className="font-medium hover:underline">
                      {e.menu.name}
                    </Link>
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      원가 {won(e.base)} → {won(e.after)}
                      {e.incomplete && "+"}
                    </span>
                    <span className="w-20 text-right font-medium tabular-nums">{signedWon(e.after - e.base)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>옵션 정보</CardTitle>
          {readOnly && <CardDescription>옵션은 사장과 매니저만 바꿀 수 있습니다.</CardDescription>}
        </CardHeader>
        <CardContent>
          <OptionForm option={option} readOnly={readOnly} />
        </CardContent>
      </Card>
    </div>
  );
}
