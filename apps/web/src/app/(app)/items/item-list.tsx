"use client";

import { formatQuantity } from "@cafe/core";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ExpiryBadge, StockStatusBadge } from "@/components/stock-badges";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Category, Item } from "@/lib/api/catalog";
import type { ItemLevel } from "@/lib/inventory";
import { cn } from "@/lib/utils";

/** all: 전체  low: 재고 없음·부족  expiry: 유통기한 지남·임박 */
export type StatusFilter = "all" | "low" | "expiry";

function needsStock(level: ItemLevel | undefined) {
  return !!level && level.status !== "ok";
}
function needsExpiryCheck(level: ItemLevel | undefined) {
  return !!level && (level.expiry === "expired" || level.expiry === "soon");
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function ItemList({ items, categories, levels, initialStatus = "all" }: {
  items: Item[];
  categories: Category[];
  /** 품목별 재고·유통기한 상태 (보관 품목 제외) */
  levels: Record<string, ItemLevel>;
  initialStatus?: StatusFilter;
}) {
  const [query, setQuery] = useState("");
  /** "all" | "none"(미분류) | 카테고리 ID */
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = items.filter((i) => i.archivedAt).length;
  const hasUncategorized = items.some((i) => !i.categoryId && !i.archivedAt);
  const lowCount = items.filter((i) => needsStock(levels[i.id])).length;
  const expiryCount = items.filter((i) => needsExpiryCheck(levels[i.id])).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!showArchived && item.archivedAt) return false;
      if (categoryId === "none" ? item.categoryId : categoryId !== "all" && item.categoryId !== categoryId) {
        return false;
      }
      if (status === "low" && !needsStock(levels[item.id])) return false;
      if (status === "expiry" && !needsExpiryCheck(levels[item.id])) return false;
      return !q || item.name.toLowerCase().includes(q) || item.barcode?.includes(q);
    });
  }, [items, levels, query, categoryId, status, showArchived]);

  const categoryFilters = [
    { id: "all", name: "전체" },
    ...categories,
    ...(hasUncategorized ? [{ id: "none", name: "미분류" }] : []),
  ];

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="품목 이름 또는 바코드 검색"
          aria-label="품목 검색"
          className="pl-8"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="카테고리">
        {categoryFilters.map((f) => (
          <Chip key={f.id} active={categoryId === f.id} onClick={() => setCategoryId(f.id)}>
            {f.name}
          </Chip>
        ))}
      </div>

      {(lowCount > 0 || expiryCount > 0 || status !== "all") && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="재고 상태">
          <Chip active={status === "all"} onClick={() => setStatus("all")}>
            모든 상태
          </Chip>
          {(lowCount > 0 || status === "low") && (
            <Chip active={status === "low"} onClick={() => setStatus("low")}>
              부족·없음 {lowCount}
            </Chip>
          )}
          {(expiryCount > 0 || status === "expiry") && (
            <Chip active={status === "expiry"} onClick={() => setStatus("expiry")}>
              유통기한 확인 {expiryCount}
            </Chip>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "아직 등록한 품목이 없습니다." : "조건에 맞는 품목이 없습니다."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {visible.map((item) => {
            const level = levels[item.id];
            const defaultUnit = item.units.find((u) => u.isDefaultPurchase) ?? null;
            const fmt = (n: number) => formatQuantity(n, item.baseUnit, defaultUnit);
            const details = [
              item.minStock > 0 && `부족 기준 ${fmt(item.minStock)}`,
              level?.nextLot?.expiresOn && `가장 빠른 유통기한 ${level.nextLot.expiresOn}`,
            ].filter(Boolean);
            return (
              <li key={item.id}>
                <Link
                  href={`/items/${item.id}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                    item.archivedAt && "opacity-60",
                  )}
                >
                  <div className="grid min-w-0 flex-1 gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium">{item.name}</span>
                      {item.categoryName && <Badge variant="secondary">{item.categoryName}</Badge>}
                      {item.archivedAt && <Badge variant="outline">보관됨</Badge>}
                    </div>
                    {details.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">{details.join(" · ")}</p>
                    )}
                  </div>
                  {level && (
                    <div className="grid shrink-0 justify-items-end gap-1 text-right">
                      <span
                        className={cn(
                          "text-sm font-medium tabular-nums",
                          level.status !== "ok" && "text-destructive",
                        )}
                      >
                        {fmt(level.quantity)}
                      </span>
                      <div className="flex flex-wrap justify-end gap-1">
                        <StockStatusBadge status={level.status} />
                        <ExpiryBadge status={level.expiry} daysLeft={level.nextLot?.daysLeft ?? null} />
                      </div>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {archivedCount > 0 && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="size-4 accent-primary"
          />
          보관된 품목도 보기 ({archivedCount}개)
        </label>
      )}
    </div>
  );
}
