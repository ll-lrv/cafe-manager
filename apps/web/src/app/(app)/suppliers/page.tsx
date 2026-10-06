import { can } from "@cafe/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireCurrentStore } from "@/lib/api/stores";
import { listSuppliers } from "@/lib/api/suppliers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "거래처" };

export default async function SuppliersPage() {
  const store = await requireCurrentStore();
  if (!can(store.role, "supplier:manage")) {
    return <p className="text-sm text-muted-foreground">거래처 관리는 사장과 매니저만 할 수 있습니다.</p>;
  }
  const suppliers = await listSuppliers(store.storeId);
  // 거래 중인 곳 먼저
  const sorted = [...suppliers.filter((s) => !s.archivedAt), ...suppliers.filter((s) => s.archivedAt)];

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/orders" className="flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          발주
        </Link>
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-bold">거래처</h1>
            <p className="text-sm text-muted-foreground">원두·우유·소모품을 주문하는 곳입니다.</p>
          </div>
          <Link href="/suppliers/new" className={buttonVariants()}>
            <Plus />
            거래처 추가
          </Link>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 등록한 거래처가 없습니다.
        </p>
      ) : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {sorted.map((s) => (
            <li key={s.id}>
              <Link
                href={`/suppliers/${s.id}`}
                className={cn("flex items-center gap-3 px-4 py-3 hover:bg-muted/50", s.archivedAt && "opacity-60")}
              >
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{s.name}</span>
                    {s.archivedAt && <Badge variant="outline">보관됨</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[s.contactName, s.phone, s.memo].filter(Boolean).join(" · ") || "연락처 없음"}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
