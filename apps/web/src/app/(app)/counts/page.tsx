import { can } from "@cafe/core";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCategories } from "@/lib/api/catalog";
import { listStockCounts } from "@/lib/api/counts";
import { requireCurrentStore } from "@/lib/api/stores";
import { StartCountForm } from "./count-forms";
import { STATUS_BADGE } from "./status";

export const metadata: Metadata = { title: "재고 실사" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

export default async function CountsPage() {
  const store = await requireCurrentStore();
  const [counts, categories] = await Promise.all([listStockCounts(store.storeId), listCategories(store.storeId)]);
  const inProgress = counts.find((c) => c.status === "in_progress");
  const history = counts.filter((c) => c.status !== "in_progress");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-bold">재고 실사</h1>
        <p className="text-sm text-muted-foreground">
          실제 수량을 세서 장부와 맞춥니다. 여러 사람이 나눠 셀 수 있고, 세는 도중에 판매·입출고가 있어도 품목마다 센 시각을
          기준으로 계산합니다.
        </p>
      </div>

      {inProgress ? (
        <Card>
          <CardHeader>
            <CardDescription>진행 중인 실사</CardDescription>
            <CardTitle>
              {inProgress.categoryName ?? "전체 품목"} · {inProgress.countedCount}/{inProgress.lineCount}개 셈
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(inProgress.countedCount / Math.max(inProgress.lineCount, 1)) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {dateFormat.format(new Date(inProgress.startedAt))} 시작
              {inProgress.createdByName && ` · ${inProgress.createdByName}`}
              {inProgress.memo && ` · ${inProgress.memo}`}
            </p>
            <Link href={`/counts/${inProgress.id}`} className={buttonVariants({ className: "w-fit" })}>
              이어서 세기
            </Link>
          </CardContent>
        </Card>
      ) : (
        can(store.role, "stock:count") && (
          <Card>
            <CardHeader>
              <CardTitle>새 실사</CardTitle>
              <CardDescription>시작하면 지금 장부 재고를 기록하고, 품목마다 센 수량을 입력합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <StartCountForm categories={categories} />
            </CardContent>
          </Card>
        )
      )}

      <Card>
        <CardHeader>
          <CardTitle>지난 실사</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 끝난 실사가 없습니다.</p>
          ) : (
            <ul className="divide-y">
              {history.map((c) => (
                <li key={c.id}>
                  <Link href={`/counts/${c.id}`} className="flex items-center gap-2 py-2.5 hover:bg-muted/50">
                    <Badge variant={STATUS_BADGE[c.status].variant}>{STATUS_BADGE[c.status].label}</Badge>
                    <div className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-medium">
                        {c.categoryName ?? "전체 품목"}
                        {c.memo && ` · ${c.memo}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {dateFormat.format(new Date(c.startedAt))} · {c.countedCount}개 셈
                        {c.status === "completed" && ` · ${c.adjustedCount}개 조정`}
                      </span>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
