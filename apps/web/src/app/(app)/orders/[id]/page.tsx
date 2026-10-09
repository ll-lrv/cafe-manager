import { can, orderTotal } from "@cafe/core";
import { ChevronLeft, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCategories, listItems } from "@/lib/api/catalog";
import { getLatestCosts } from "@/lib/api/menus";
import { getPurchaseOrder } from "@/lib/api/purchasing";
import { getStockLevels } from "@/lib/api/stock";
import { requireCurrentStore } from "@/lib/api/stores";
import { activeItemsInCategoryOrder } from "@/lib/inventory";
import { getSupplier } from "@/lib/api/suppliers";
import { loadDailyUsage, loadIncoming } from "@/lib/item-usage";
import { buildOrderSuggestions } from "@/lib/order-suggestions";
import {
  CopyOrderButton,
  DraftLines,
  OrderHeaderForm,
  OrderLinesView,
  ReceiveForm,
  StatusButtons,
} from "../order-forms";
import { dayLabel, ORDER_STATUS, won } from "../status";

export const metadata: Metadata = { title: "발주서" };

const dateTimeFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const [{ id }, store] = await Promise.all([params, requireCurrentStore()]);
  if (!can(store.role, "purchase:manage")) {
    return <p className="text-sm text-muted-foreground">발주는 사장과 매니저만 할 수 있습니다.</p>;
  }
  const order = await getPurchaseOrder(store.storeId, id);
  if (!order) notFound();
  const status = ORDER_STATUS[order.status];
  const isDraft = order.status === "draft";
  const canReceive = order.status === "ordered" || order.status === "partially_received";

  // 작성 중일 때만 품목 선택지·추천이 필요하다.
  const [items, categories, stock, costs, usage, incoming, supplier] = isDraft
    ? await Promise.all([
        listItems(store.storeId),
        listCategories(store.storeId),
        getStockLevels(store.storeId),
        getLatestCosts(store.storeId),
        loadDailyUsage(store.storeId, store.timeZone),
        loadIncoming(store.storeId),
        getSupplier(store.storeId, order.supplierId),
      ])
    : [[], [], {}, {}, {}, {}, null];
  const suggestionCount = supplier
    ? buildOrderSuggestions(items, stock, costs, usage, supplier, incoming, order.lines.map((l) => l.itemId)).length
    : 0;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/orders" className="flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          발주
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{order.supplierName}</h1>
          <Badge variant={status.variant}>{status.label}</Badge>
          {order.supplierPhone && (
            <a
              href={`tel:${order.supplierPhone}`}
              className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <Phone className="size-4" />
              {order.supplierPhone}
            </a>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {order.orderedAt
            ? `${dateTimeFormat(store.timeZone).format(new Date(order.orderedAt))} 발주`
            : `${dateTimeFormat(store.timeZone).format(new Date(order.createdAt))} 작성`}
          {order.createdByName && ` · ${order.createdByName}`}
          {order.expectedOn && ` · ${dayLabel(order.expectedOn)} 입고 예정`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            품목 {order.lines.length}개 · {won(orderTotal(order.lines))}
          </CardTitle>
          {isDraft && <CardDescription>수량·단위·단가를 정한 뒤 발주하세요. 발주한 뒤에는 되돌려야 고칠 수 있습니다.</CardDescription>}
        </CardHeader>
        <CardContent>
          {isDraft ? (
            <DraftLines
              order={order}
              items={activeItemsInCategoryOrder(items, categories)}
              costs={costs}
              suggestionCount={suggestionCount}
            />
          ) : (
            <OrderLinesView order={order} />
          )}
        </CardContent>
      </Card>

      {(isDraft || order.status === "ordered") && (
        <Card>
          <CardContent className="grid gap-4">
            <OrderHeaderForm order={order} />
            <div className="flex flex-wrap gap-2">
              {order.status === "ordered" && <CopyOrderButton order={order} storeName={store.storeName} />}
              <StatusButtons order={order} />
            </div>
          </CardContent>
        </Card>
      )}

      {canReceive && (
        <Card>
          <CardHeader>
            <CardTitle>입고 처리</CardTitle>
            <CardDescription>들어온 수량을 확인해 입력하면 재고에 반영되고, 단가는 원가 계산에 쓰입니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ReceiveForm order={order} />
            {order.status === "partially_received" && <StatusButtons order={order} />}
          </CardContent>
        </Card>
      )}

      {order.memo && !isDraft && order.status !== "ordered" && (
        <p className="text-sm text-muted-foreground">메모: {order.memo}</p>
      )}
    </div>
  );
}
