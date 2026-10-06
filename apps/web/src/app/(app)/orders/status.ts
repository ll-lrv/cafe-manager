import type { PurchaseOrderStatus } from "@cafe/core";

export const ORDER_STATUS: Record<
  PurchaseOrderStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  draft: { label: "작성 중", variant: "outline" },
  ordered: { label: "발주함", variant: "default" },
  partially_received: { label: "일부 입고", variant: "default" },
  received: { label: "입고 완료", variant: "secondary" },
  cancelled: { label: "취소", variant: "outline" },
};

/** 아직 끝나지 않은 발주서 (목록 위쪽, 대시보드 입고 예정) */
export const OPEN_STATUSES: PurchaseOrderStatus[] = ["draft", "ordered", "partially_received"];

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** YYYY-MM-DD → "10월 8일 (수)" */
export function dayLabel(date: string): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
