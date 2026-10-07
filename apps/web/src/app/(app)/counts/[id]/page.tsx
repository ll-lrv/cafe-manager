import { can, formatQuantity } from "@cafe/core";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getStockCount, type StockCountLine } from "@/lib/api/counts";
import { getStockLevels } from "@/lib/api/stock";
import { requireCurrentStore } from "@/lib/api/stores";
import { CompleteCountButtons, CountSheet } from "../count-forms";
import { STATUS_BADGE } from "../status";
import { StockCountRealtime } from "./count-realtime";

export const metadata: Metadata = { title: "재고 실사" };

const dateFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });

function fmt(line: StockCountLine, n: number) {
  return formatQuantity(n, line.baseUnit, line.units.find((u) => u.isDefaultPurchase) ?? null);
}

/** 끝난 실사 결과: 품목마다 센 수량, 센 시각의 장부, 적용된 조정 */
function CountResult({ lines }: { lines: StockCountLine[] }) {
  const counted = lines.filter((l) => l.countedQuantity !== null);
  const skipped = lines.filter((l) => l.countedQuantity === null);
  return (
    <div className="grid gap-4">
      <ul className="divide-y">
        {counted.map((l) => (
          <li key={l.itemId} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5 text-sm">
            <span className="font-medium">{l.itemName}</span>
            <span className="text-muted-foreground tabular-nums">
              센 수량 {fmt(l, l.countedQuantity!)} · 장부 {fmt(l, l.bookAtCount ?? 0)}
            </span>
            <span className="ml-auto">
              {l.adjustment === null ? (
                <Badge variant="outline">반영 안 됨</Badge>
              ) : l.adjustment === 0 ? (
                <Badge variant="secondary">일치</Badge>
              ) : (
                <Badge variant="destructive">
                  {l.adjustment > 0 ? "+" : "−"}
                  {fmt(l, Math.abs(l.adjustment))} 조정
                </Badge>
              )}
            </span>
          </li>
        ))}
      </ul>
      {skipped.length > 0 && (
        <p className="text-xs text-muted-foreground">세지 않은 품목 {skipped.length}개: {skipped.map((l) => l.itemName).join(", ")}</p>
      )}
    </div>
  );
}

export default async function CountPage({ params }: PageProps<"/counts/[id]">) {
  const [{ id }, store] = await Promise.all([params, requireCurrentStore()]);
  const [result, stock] = await Promise.all([getStockCount(store.storeId, id), getStockLevels(store.storeId)]);
  if (!result) notFound();
  const { count, lines } = result;
  const inProgress = count.status === "in_progress";
  const canComplete = can(store.role, "stock:count:complete");
  const todoCount = count.lineCount - count.countedCount;

  return (
    <div className="grid gap-6">
      {inProgress && <StockCountRealtime countId={count.id} />}
      <div className="grid gap-1">
        <Link href="/counts" className="flex w-fit items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          실사 목록
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold">{count.categoryName ?? "전체 품목"} 실사</h1>
          <Badge variant={STATUS_BADGE[count.status].variant}>{STATUS_BADGE[count.status].label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {dateFormat(store.timeZone).format(new Date(count.startedAt))} 시작
          {count.createdByName && ` · ${count.createdByName}`}
          {count.completedAt &&
            ` · ${dateFormat(store.timeZone).format(new Date(count.completedAt))} ${count.status === "completed" ? "완료" : "취소"}`}
          {count.completedByName && ` · ${count.completedByName}`}
          {count.memo && ` · ${count.memo}`}
        </p>
      </div>

      {inProgress ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {count.countedCount}/{count.lineCount}개 셈
              </CardTitle>
              <CardDescription>
                진열대·창고에 있는 실제 수량을 입력하세요. 묶음 단위가 있는 품목은 &quot;3봉 + 200g&quot;처럼 나눠 입력할 수
                있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CountSheet countId={count.id} lines={lines} stock={stock} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>완료</CardTitle>
              <CardDescription>
                {canComplete
                  ? "완료하면 센 품목마다 센 시각의 장부와의 차이만큼 재고를 조정합니다. 세지 않은 품목은 그대로 둡니다."
                  : "다 세면 사장이나 매니저에게 완료를 요청해 주세요. 완료할 때 재고에 반영됩니다."}
              </CardDescription>
            </CardHeader>
            {canComplete && (
              <CardContent>
                <CompleteCountButtons countId={count.id} countedCount={count.countedCount} todoCount={todoCount} />
              </CardContent>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{count.status === "completed" ? `결과 · ${count.adjustedCount}개 품목 조정` : "취소된 실사"}</CardTitle>
            {count.status === "cancelled" && <CardDescription>재고에 반영되지 않았습니다.</CardDescription>}
          </CardHeader>
          <CardContent>
            <CountResult lines={lines} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
