import { can } from "@cafe/core";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { requireCurrentStore } from "@/lib/api/stores";
import { SupplierForm } from "../supplier-forms";

export const metadata: Metadata = { title: "거래처 추가" };

export default async function NewSupplierPage({ searchParams }: PageProps<"/suppliers/new">) {
  const [{ next }, store] = await Promise.all([searchParams, requireCurrentStore()]);
  if (!can(store.role, "supplier:manage")) {
    return <p className="text-sm text-muted-foreground">거래처 관리는 사장과 매니저만 할 수 있습니다.</p>;
  }
  const back = next === "/orders/new" ? "/orders/new" : "/suppliers";
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href={back} className="flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          {back === "/orders/new" ? "새 발주" : "거래처 목록"}
        </Link>
        <h1 className="text-xl font-bold">거래처 추가</h1>
      </div>
      <Card>
        <CardContent>
          <SupplierForm next={typeof next === "string" ? next : undefined} />
        </CardContent>
      </Card>
    </div>
  );
}
