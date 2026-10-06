import { can } from "@cafe/core";
import { Plus, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { listCategories, listItems } from "@/lib/api/catalog";
import { requireCurrentStore } from "@/lib/api/stores";
import { ItemList } from "./item-forms";

export const metadata: Metadata = { title: "품목" };

export default async function ItemsPage() {
  const store = await requireCurrentStore();
  const [items, categories] = await Promise.all([listItems(store.storeId), listCategories(store.storeId)]);
  const canManage = can(store.role, "catalog:manage");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-bold">품목</h1>
          <p className="text-sm text-muted-foreground">원두, 우유, 컵처럼 재고로 관리하는 물품입니다.</p>
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
      <ItemList items={items} categories={categories} />
    </div>
  );
}
