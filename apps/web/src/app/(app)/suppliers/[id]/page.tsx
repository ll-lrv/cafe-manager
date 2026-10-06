import { can, orderTotal } from "@cafe/core";
import { ChevronLeft, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listItems } from "@/lib/api/catalog";
import { listPurchaseOrders } from "@/lib/api/purchasing";
import { requireCurrentStore } from "@/lib/api/stores";
import { getSupplier } from "@/lib/api/suppliers";
import { ORDER_STATUS, won } from "../../orders/status";
import { ArchiveSupplierButton, SupplierForm } from "../supplier-forms";

export const metadata: Metadata = { title: "거래처 정보" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const [{ id }, store] = await Promise.all([params, requireCurrentStore()]);
  if (!can(store.role, "supplier:manage")) {
    return <p className="text-sm text-muted-foreground">거래처 관리는 사장과 매니저만 할 수 있습니다.</p>;
  }
  const supplier = await getSupplier(store.storeId, id);
  if (!supplier) notFound();
  const [items, orders] = await Promise.all([listItems(store.storeId), listPurchaseOrders(store.storeId, { limit: 50 })]);
  const supplied = items.filter((i) => i.defaultSupplierId === supplier.id && !i.archivedAt);
  const supplierOrders = orders.filter((o) => o.supplierId === supplier.id).slice(0, 10);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/suppliers" className="flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          거래처 목록
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{supplier.name}</h1>
          {supplier.archivedAt && <Badge variant="outline">보관됨</Badge>}
          <div className="ml-auto">
            <ArchiveSupplierButton supplierId={supplier.id} archived={!!supplier.archivedAt} />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>발주 {supplierOrders.length > 0 ? `최근 ${supplierOrders.length}건` : ""}</CardTitle>
          {!supplier.archivedAt && can(store.role, "purchase:manage") && (
            <CardAction>
              <Link href={`/orders/new?supplier=${supplier.id}`} className={buttonVariants({ size: "sm" })}>
                <Plus />
                새 발주
              </Link>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {supplierOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 발주서가 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {supplierOrders.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex items-center gap-2 py-2 text-sm hover:underline">
                    <Badge variant={ORDER_STATUS[o.status].variant}>{ORDER_STATUS[o.status].label}</Badge>
                    <span>{dateFormat.format(new Date(o.orderedAt ?? o.createdAt))}</span>
                    <span className="text-muted-foreground">품목 {o.lines.length}개</span>
                    <span className="ml-auto tabular-nums">{won(orderTotal(o.lines))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>주로 주문하는 품목 {supplied.length}개</CardTitle>
        </CardHeader>
        <CardContent>
          {supplied.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              품목 정보에서 기본 거래처를 이 거래처로 정하면, 발주서를 쓸 때 부족한 품목을 추천합니다.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {supplied.map((i) => (
                <Link key={i.id} href={`/items/${i.id}`}>
                  <Badge variant="secondary">{i.name}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>거래처 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <SupplierForm supplier={supplier} />
        </CardContent>
      </Card>
    </div>
  );
}
