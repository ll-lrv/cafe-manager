import { can } from "@cafe/core";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/form-parts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listMenus } from "@/lib/api/menus";
import { getMenuAliases, listSaleImports } from "@/lib/api/sale-imports";
import { requireCurrentStore } from "@/lib/api/stores";
import { storeToday } from "@/lib/inventory";
import { cancelImportAction } from "./actions";
import { SalesImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "판매 가져오기" };

export default async function SalesImportPage() {
  const store = await requireCurrentStore();
  if (!can(store.role, "sale:import")) {
    return <p className="text-sm text-muted-foreground">판매 가져오기는 사장과 매니저만 할 수 있습니다.</p>;
  }
  const [menus, aliases, imports] = await Promise.all([
    listMenus(store.storeId),
    getMenuAliases(store.storeId),
    listSaleImports(store.storeId),
  ]);
  const activeMenus = menus.filter((m) => !m.archivedAt).map((m) => ({ id: m.id, name: m.name, price: m.price }));
  const dateTime = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: store.timeZone,
  });
  const day = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: store.timeZone });
  const range = (from: string | null, to: string | null) => {
    if (!from || !to) return null;
    const [a, b] = [day.format(new Date(from)), day.format(new Date(to))];
    return a === b ? a : `${a} ~ ${b}`;
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/sales" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ChevronLeft className="size-4" />
          판매
        </Link>
        <h1 className="text-xl font-bold">판매 가져오기 (CSV)</h1>
        <p className="text-sm text-muted-foreground">
          POS 에서 내려받은 판매 내역을 CSV 로 저장해 올리면, 레시피대로 재료를 차감하며 한 번에 기록합니다. 같은
          판매는 두 번 들어가지 않으니 기간이 겹치는 파일을 올려도 됩니다.
        </p>
      </div>

      {activeMenus.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          먼저 메뉴를 등록해 주세요. 파일의 메뉴 이름을 등록한 메뉴와 맞춰 가져옵니다.
        </p>
      ) : (
        <SalesImportWizard menus={activeMenus} aliases={aliases} today={storeToday(store.timeZone)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>가져오기 기록</CardTitle>
          <CardDescription>잘못 가져왔으면 취소하세요. 그때 들어온 판매와 재료 차감이 모두 되돌아갑니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {imports.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">아직 가져온 파일이 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {imports.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-medium">{i.fileName}</span>
                    <span className="text-xs text-muted-foreground">
                      {[
                        dateTime.format(new Date(i.createdAt)),
                        i.createdByName,
                        range(i.firstSoldAt, i.lastSoldAt) && `판매 ${range(i.firstSoldAt, i.lastSoldAt)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <span className="text-sm tabular-nums">
                    {i.saleCount.toLocaleString("ko-KR")}건 · {i.quantity.toLocaleString("ko-KR")}개 ·{" "}
                    {i.amount.toLocaleString("ko-KR")}원
                  </span>
                  <ActionButton
                    action={cancelImportAction}
                    fields={{ importId: i.id }}
                    confirmMessage={`${i.fileName} 에서 가져온 판매 ${i.saleCount.toLocaleString("ko-KR")}건을 모두 취소할까요? 차감된 재료도 되돌아갑니다.`}
                    variant="outline"
                    size="sm"
                    pendingText="취소 중…"
                    aria-label={`${i.fileName} 가져오기 취소`}
                  >
                    가져오기 취소
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
