import { can, orderTotal } from "@cafe/core";
import { ChevronRight, Plus, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listPurchaseOrders, type PurchaseOrder } from "@/lib/api/purchasing";
import { requireCurrentStore } from "@/lib/api/stores";
import { storeToday } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { dayLabel, OPEN_STATUSES, ORDER_STATUS, won } from "./status";

export const metadata: Metadata = { title: "발주" };

const dateFormat = (timeZone: string) => new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone });

function OrderRow({ order, today, timeZone }: { order: PurchaseOrder; today: string; timeZone: string }) {
  const date = dateFormat(timeZone);
  const status = ORDER_STATUS[order.status];
  const late = order.expectedOn && order.expectedOn < today && (order.status === "ordered" || order.status === "partially_received");
  return (
    <li>
      <Link href={`/orders/${order.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="font-medium">{order.supplierName}</span>
            {late && <Badge variant="destructive">입고 예정일 지남</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {order.orderedAt ? `${date.format(new Date(order.orderedAt))} 발주` : `${date.format(new Date(order.createdAt))} 작성`}
            {order.expectedOn && ` · ${dayLabel(order.expectedOn)} 입고 예정`}
            {` · ${order.lines.map((l) => l.itemName).join(", ") || "품목 없음"}`}
          </p>
        </div>
        <span className="shrink-0 text-sm tabular-nums">{won(orderTotal(order.lines))}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

export default async function OrdersPage() {
  const store = await requireCurrentStore();
  if (!can(store.role, "purchase:manage")) {
    return <p className="text-sm text-muted-foreground">발주는 사장과 매니저만 할 수 있습니다.</p>;
  }
  const orders = await listPurchaseOrders(store.storeId);
  const today = storeToday(store.timeZone);
  const open = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const closed = orders.filter((o) => !OPEN_STATUSES.includes(o.status));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-bold">발주</h1>
          <p className="text-sm text-muted-foreground">
            발주서를 작성해 거래처에 보내고, 물건이 오면 입고 처리합니다. 입고하면 재고와 원가에 바로 반영됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/suppliers" className={buttonVariants({ variant: "outline" })}>
            <Truck />
            거래처
          </Link>
          <Link href="/orders/new" className={buttonVariants()}>
            <Plus />
            새 발주
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>진행 중 {open.length}건</CardTitle>
        </CardHeader>
        <CardContent className={cn(open.length > 0 && "px-0")}>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">진행 중인 발주가 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {open.map((o) => (
                <OrderRow key={o.id} order={o} today={today} timeZone={store.timeZone} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>지난 발주</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y">
              {closed.map((o) => (
                <OrderRow key={o.id} order={o} today={today} timeZone={store.timeZone} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
