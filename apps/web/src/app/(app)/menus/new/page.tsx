import { can } from "@cafe/core";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { requireCurrentStore } from "@/lib/api/stores";
import { BackLink } from "../back-link";
import { MenuForm } from "../menu-forms";

export const metadata: Metadata = { title: "메뉴 추가" };

export default async function NewMenuPage() {
  const store = await requireCurrentStore();
  if (!can(store.role, "catalog:manage")) {
    return <p className="text-sm text-muted-foreground">메뉴 추가는 사장과 매니저만 할 수 있습니다.</p>;
  }
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <BackLink />
        <h1 className="text-xl font-bold">메뉴 추가</h1>
      </div>
      <Card>
        <CardContent>
          <MenuForm />
        </CardContent>
      </Card>
    </div>
  );
}
