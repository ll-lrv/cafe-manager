import { can } from "@cafe/core";
import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { requireCurrentStore } from "@/lib/api/stores";
import { BackLink } from "../../back-link";
import { OptionForm } from "../option-forms";

export const metadata: Metadata = { title: "옵션 추가" };

export default async function NewOptionPage() {
  const store = await requireCurrentStore();
  if (!can(store.role, "catalog:manage")) {
    return <p className="text-sm text-muted-foreground">옵션 추가는 사장과 매니저만 할 수 있습니다.</p>;
  }
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <BackLink href="/menus/options" label="옵션 목록" />
        <h1 className="text-xl font-bold">옵션 추가</h1>
      </div>
      <Card>
        <CardContent>
          <OptionForm />
        </CardContent>
      </Card>
    </div>
  );
}
