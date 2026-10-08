import { can } from "@cafe/core";
import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { listOptions } from "@/lib/api/options";
import { requireCurrentStore } from "@/lib/api/stores";
import { optionPriceText, ruleText } from "@/lib/option-text";
import { cn } from "@/lib/utils";
import { BackLink } from "../back-link";

export const metadata: Metadata = { title: "메뉴 옵션" };

export default async function OptionsPage({ searchParams }: PageProps<"/menus/options">) {
  const [{ archived }, store] = await Promise.all([searchParams, requireCurrentStore()]);
  const showArchived = archived === "1";
  const options = await listOptions(store.storeId);
  const visible = options.filter((o) => showArchived || !o.archivedAt);
  const archivedCount = options.filter((o) => o.archivedAt).length;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <BackLink />
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-bold">메뉴 옵션</h1>
            <p className="text-sm text-muted-foreground">
              샷 추가·오트밀크 변경·사이즈업처럼 판매할 때 붙이는 옵션입니다. 옵션의 재료 규칙대로 재료가 더 차감되거나 바뀌고,
              원가에도 반영됩니다.
            </p>
          </div>
          {can(store.role, "catalog:manage") && (
            <Link href="/menus/options/new" className={buttonVariants()}>
              <Plus />
              옵션 추가
            </Link>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">아직 등록한 옵션이 없습니다.</p>
      ) : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {visible.map((option) => (
            <li key={option.id}>
              <Link
                href={`/menus/options/${option.id}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                  option.archivedAt && "opacity-60",
                )}
              >
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{option.name}</span>
                    {option.archivedAt && <Badge variant="outline">보관됨</Badge>}
                    {option.rules.length === 0 && <Badge variant="outline">재료 규칙 없음</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{option.rules.map(ruleText).join(" · ")}</p>
                </div>
                <span className="shrink-0 text-sm tabular-nums">{optionPriceText(option.price)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {archivedCount > 0 && (
        <Link
          href={showArchived ? "/menus/options" : "/menus/options?archived=1"}
          className="w-fit text-sm text-muted-foreground hover:underline"
        >
          {showArchived ? "보관된 옵션 숨기기" : `보관된 옵션도 보기 (${archivedCount}개)`}
        </Link>
      )}
    </div>
  );
}
