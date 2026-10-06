import { can } from "@cafe/core";
import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getItem, isItemInUse, listCategories } from "@/lib/api/catalog";
import { requireCurrentStore } from "@/lib/api/stores";
import { BackLink } from "../back-link";
import { ArchiveItemButton, ItemForm, UnitsEditor } from "../item-forms";

export const metadata: Metadata = { title: "품목 정보" };

export default async function ItemPage({ params, searchParams }: PageProps<"/items/[id]">) {
  const [{ id }, { created }, store] = await Promise.all([params, searchParams, requireCurrentStore()]);
  const [item, categories] = await Promise.all([getItem(store.storeId, id), listCategories(store.storeId)]);
  if (!item) notFound();
  const inUse = await isItemInUse(item.id);

  const readOnly = !can(store.role, "catalog:manage");

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
          <ItemForm item={item} categories={categories} baseUnitLocked={inUse} readOnly={readOnly} />
        </CardContent>
      </Card>
    </div>
  );
}
