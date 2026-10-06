import { expiryLabel, type ExpiryStatus, type StockStatus } from "@cafe/core";
import { Badge } from "@/components/ui/badge";

/** 재고 없음·부족 배지. 충분하면 아무것도 그리지 않는다. */
export function StockStatusBadge({ status }: { status: StockStatus }) {
  if (status === "out") return <Badge variant="destructive">재고 없음</Badge>;
  if (status === "low") return <Badge variant="destructive">부족</Badge>;
  return null;
}

/** 유통기한 지남·임박 배지. 여유가 있으면 아무것도 그리지 않는다. */
export function ExpiryBadge({ status, daysLeft }: { status: ExpiryStatus | null; daysLeft: number | null }) {
  if (status === null || daysLeft === null || status === "ok") return null;
  return (
    <Badge variant={status === "expired" ? "destructive" : "outline"} className={status === "soon" ? "border-amber-500 text-amber-700 dark:text-amber-400" : undefined}>
      유통기한 {expiryLabel(daysLeft)}
    </Badge>
  );
}
