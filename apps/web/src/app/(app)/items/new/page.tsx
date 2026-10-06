import { can } from "@cafe/core";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { listCategories } from "@/lib/api/catalog";
import { requireCurrentStore } from "@/lib/api/stores";
import { BackLink } from "../back-link";
import { ItemForm } from "../item-forms";

export const metadata: Metadata = { title: "품목 추가" };

export default async function NewItemPage() {
  const store = await requireCurrentStore();
  if (!can(store.role, "catalog:manage")) {
    return <p className="text-sm text-muted-foreground">품목 추가는 사장과 매니저만 할 수 있습니다.</p>;
  }
  const categories = await listCategories(store.storeId);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <BackLink />
        <h1 className="text-xl font-bold">품목 추가</h1>
      </div>
      <Card>
        <CardContent>
          <ItemForm categories={categories} />
        </CardContent>
      </Card>
    </div>
  );
}
