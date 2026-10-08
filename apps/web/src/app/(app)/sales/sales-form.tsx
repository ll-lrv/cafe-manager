"use client";

import { formatQuantity, mergeDeltas, roundQty, saleDeductions, type BaseUnit, type ItemUnit } from "@cafe/core";
import { Minus, Plus, Search } from "lucide-react";
import { useState } from "react";
import { ActionButton, FormMessage, SubmitButton, useFormAction, useToastResult } from "@/components/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Menu } from "@/lib/api/menus";
import type { Sale } from "@/lib/api/sales";
import { cn } from "@/lib/utils";
import { cancelSaleAction, recordSalesAction } from "./actions";

export interface ItemInfo {
  name: string;
  baseUnit: BaseUnit;
  defaultUnit: ItemUnit | null;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function SalesForm({ menus, items, stock, date, isToday }: {
  /** 판매 중인 메뉴 (보관 제외) */
  menus: Pick<Menu, "id" | "name" | "price" | "recipe">[];
  /** 재료 품목 정보 (차감 미리보기용) */
  items: Record<string, ItemInfo>;
  /** 품목별 현재 재고 (기본 단위) */
  stock: Record<string, number>;
  /** 판매 날짜 YYYY-MM-DD */
  date: string;
  isToday: boolean;
}) {
  const { state, pending, formProps } = useFormAction(recordSalesAction);
  useToastResult(state?.ok ? state : undefined);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");

  // 기록에 성공하면 수량을 비운다.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setQuantities({});
  }

  const setQuantity = (menuId: string, value: number) =>
    setQuantities((q) => ({ ...q, [menuId]: Math.max(0, Math.min(10000, Math.floor(value) || 0)) }));

  const lines = menus.filter((m) => (quantities[m.id] ?? 0) > 0).map((m) => ({ menu: m, quantity: quantities[m.id]! }));
  const totalCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totalAmount = lines.reduce((sum, l) => sum + l.menu.price * l.quantity, 0);
  // 차감될 재료 (packages/core 의 saleDeductions — DB 함수 record_sales 와 같은 계산)
  const deductions = mergeDeltas(lines.flatMap((l) => saleDeductions(l.menu.recipe, l.quantity)));
  const noRecipe = lines.filter((l) => l.menu.recipe.length === 0);

  const q = query.trim().toLowerCase();
  const visibleMenus = menus.filter((m) => !q || m.name.toLowerCase().includes(q));

  return (
    <form {...formProps} className="grid gap-4">
      <input type="hidden" name="date" value={date} />
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(lines.map((l) => ({ menuId: l.menu.id, quantity: l.quantity })))}
      />

      {menus.length > 8 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="메뉴 검색"
            aria-label="메뉴 검색"
            className="pl-8"
          />
        </div>
      )}

      <ul className="divide-y">
        {visibleMenus.map((menu) => {
          const value = quantities[menu.id] ?? 0;
          return (
            <li key={menu.id} className="flex items-center gap-2 py-2">
              <div className="grid min-w-0 flex-1">
                <span className={cn("truncate text-sm", value > 0 && "font-medium")}>{menu.name}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {won(menu.price)}
                  {menu.recipe.length === 0 && <Badge variant="outline">레시피 없음</Badge>}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`${menu.name} 하나 빼기`}
                  disabled={value === 0}
                  onClick={() => setQuantity(menu.id, value - 1)}
                >
                  <Minus />
                </Button>
                <Input
                  inputMode="numeric"
                  aria-label={`${menu.name} 판매 수량`}
                  value={value === 0 ? "" : String(value)}
                  placeholder="0"
                  onChange={(e) => setQuantity(menu.id, Number(e.target.value.replace(/[^0-9]/g, "")))}
                  className="w-14 text-center tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`${menu.name} 하나 더하기`}
                  onClick={() => setQuantity(menu.id, value + 1)}
                >
                  <Plus />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {totalCount > 0 && (
        <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm" aria-live="polite">
          <p className="font-medium">차감될 재료</p>
          {deductions.length === 0 ? (
            <p className="text-muted-foreground">레시피가 없어 차감할 재료가 없습니다.</p>
          ) : (
            <ul className="grid gap-1">
              {deductions.map((d) => {
                const item = items[d.itemId];
                if (!item) return null;
                const fmt = (n: number) => formatQuantity(n, item.baseUnit, item.defaultUnit);
                const after = roundQty((stock[d.itemId] ?? 0) + d.quantity);
                return (
                  <li key={d.itemId} className="flex flex-wrap items-center gap-x-2">
                    <span>{item.name}</span>
                    <span className="text-muted-foreground tabular-nums">−{formatQuantity(-d.quantity, item.baseUnit)}</span>
                    <span className={cn("ml-auto tabular-nums", after < 0 ? "text-destructive" : "text-muted-foreground")}>
                      남는 재고 {fmt(after)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {noRecipe.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {noRecipe.map((l) => l.menu.name).join(", ")}은(는) 레시피가 없어 재료가 차감되지 않습니다.
            </p>
          )}
          {deductions.some((d) => roundQty((stock[d.itemId] ?? 0) + d.quantity) < 0) && (
            <p className="text-xs text-destructive">재고가 마이너스가 되는 재료가 있습니다. 빠뜨린 입고 기록이 없는지 확인해 주세요.</p>
          )}
        </div>
      )}

      {state?.error && <FormMessage state={state} />}
      <SubmitButton pending={pending} disabled={totalCount === 0} pendingText="기록 중…" className="w-full" size="lg">
        {totalCount === 0
          ? "판매 수량을 입력해 주세요"
          : `${isToday ? "판매 기록" : `${date} 판매 기록`} · ${totalCount.toLocaleString("ko-KR")}개 · ${won(totalAmount)}`}
      </SubmitButton>
    </form>
  );
}

const timeFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });

function CancelSaleButton({ sale }: { sale: Sale }) {
  return (
    <ActionButton
      action={cancelSaleAction}
      fields={{ saleId: sale.id }}
      confirmMessage={
        sale.quantity < 0
          ? `${sale.menuName} ${-sale.quantity}개 취소 기록을 지울까요? 되돌렸던 재료가 다시 차감되고 매출에 다시 들어갑니다.`
          : `${sale.menuName} ${sale.quantity}개 판매를 취소할까요? 차감된 재료도 되돌아갑니다.`
      }
      variant="ghost"
      size="sm"
      pendingText="취소 중…"
      aria-label={sale.quantity < 0 ? `${sale.menuName} 취소 기록 지우기` : `${sale.menuName} 판매 취소`}
    >
      {sale.quantity < 0 ? "지우기" : "취소"}
    </ActionButton>
  );
}

export function SaleList({ sales, canCancel, timeZone }: { sales: Sale[]; canCancel: boolean; timeZone: string }) {
  if (sales.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">이 날 판매 기록이 없습니다.</p>;
  }
  return (
    <ul className="divide-y">
      {sales.map((sale) => (
        <li key={sale.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
          <span className="text-sm font-medium">{sale.menuName}</span>
          <span className="text-sm tabular-nums">{sale.quantity.toLocaleString("ko-KR")}개</span>
          <span className="text-sm text-muted-foreground tabular-nums">{won(sale.amount)}</span>
          {sale.quantity < 0 && <Badge variant="destructive">취소</Badge>}
          {sale.source === "csv" && <Badge variant="outline">CSV</Badge>}
          <span className="w-full text-xs text-muted-foreground sm:w-auto">
            {timeFormat(timeZone).format(new Date(sale.soldAt))}
            {sale.createdByName && ` · ${sale.createdByName}`}
          </span>
          {canCancel && (
            <div className="ml-auto">
              <CancelSaleButton sale={sale} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
