import { can } from "@cafe/core";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCategories, listItems } from "@/lib/api/catalog";
import { requireCurrentStore } from "@/lib/api/stores";
import { BackLink } from "../back-link";
import { AddCategoryForm, CategoryRow } from "./category-forms";

export const metadata: Metadata = { title: "카테고리" };

export default async function CategoriesPage() {
  const store = await requireCurrentStore();
  if (!can(store.role, "catalog:manage")) {
    return <p className="text-sm text-muted-foreground">카테고리 관리는 사장과 매니저만 할 수 있습니다.</p>;
  }
  const [categories, items] = await Promise.all([listCategories(store.storeId), listItems(store.storeId)]);
  const itemCount = (categoryId: string) => items.filter((i) => i.categoryId === categoryId && !i.archivedAt).length;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <BackLink />
        <h1 className="text-xl font-bold">카테고리</h1>
        <p className="text-sm text-muted-foreground">품목 목록을 원두·유제품·소모품처럼 나눠 볼 때 씁니다.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>카테고리 추가</CardTitle>
        </CardHeader>
        <CardContent>
          <AddCategoryForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>카테고리 {categories.length}개</CardTitle>
          <CardDescription>위아래 버튼으로 목록에 보이는 순서를 바꿀 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 카테고리가 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {categories.map((c, i) => (
                <CategoryRow
                  key={`${c.id}:${c.name}`}
                  category={c}
                  itemCount={itemCount(c.id)}
                  isFirst={i === 0}
                  isLast={i === categories.length - 1}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
