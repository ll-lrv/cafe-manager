import type { StockCountStatus } from "@/lib/api/counts";

export const STATUS_BADGE: Record<StockCountStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  in_progress: { label: "진행 중", variant: "default" },
  completed: { label: "완료", variant: "secondary" },
  cancelled: { label: "취소", variant: "outline" },
};
