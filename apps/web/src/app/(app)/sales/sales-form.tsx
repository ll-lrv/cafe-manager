"use client";

import {
  applyOptions,
  formatQuantity,
  mergeDeltas,
  optionLineName,
  roundQty,
  saleDeductions,
  type BaseUnit,
  type ItemUnit,
  type OptionRule,
} from "@cafe/core";
import { Minus, Plus, Search, SlidersHorizontal, X } from "lucide-react";
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

export interface SaleOption {
  id: string;
  name: string;
  price: number;
  rules: OptionRule[];
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 판매 줄 키: 메뉴 + 정렬한 옵션 id. 같은 메뉴라도 옵션 묶음이 다르면 다른 줄 */
const lineKey = (menuId: string, optionIds: string[]) => `${menuId}|${[...optionIds].sort().join(",")}`;
const parseKey = (key: string) => {
  const [menuId, options] = key.split("|") as [string, string];
  return { menuId, optionIds: options ? options.split(",") : [] };
};

export function SalesForm({ menus, options, items, stock, date, isToday }: {
  /** 판매 중인 메뉴 (보관 제외) */
  menus: Pick<Menu, "id" | "name" | "price" | "recipe">[];
  /** 붙일 수 있는 옵션 (보관 제외) */
  options: SaleOption[];
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
  /** 줄 키 → 수량. 옵션 줄은 0이 되어도 지우기 전까지 남는다 */
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  /** 옵션을 고르는 중인 메뉴와 고른 옵션 */
  const [picking, setPicking] = useState<{ menuId: string; optionIds: string[] } | null>(null);

  // 기록에 성공하면 수량을 비운다.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) {
      setQuantities({});
      setPicking(null);
    }
  }

  const clamp = (value: number) => Math.max(0, Math.min(10000, Math.floor(value) || 0));
  const setQuantity = (key: string, value: number) => setQuantities((q) => ({ ...q, [key]: clamp(value) }));
  const removeLine = (key: string) => setQuantities((q) => Object.fromEntries(Object.entries(q).filter(([k]) => k !== key)));
  const addOptionLine = () => {
    if (!picking || picking.optionIds.length === 0) return;
    const key = lineKey(picking.menuId, picking.optionIds);
    setQuantities((q) => ({ ...q, [key]: clamp((q[key] ?? 0) + 1) }));
    setPicking(null);
  };

  const menuById = new Map(menus.map((m) => [m.id, m]));
  const optionById = new Map(options.map((o) => [o.id, o]));
  const lines = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .flatMap(([key, quantity]) => {
      const { menuId, optionIds } = parseKey(key);
      const menu = menuById.get(menuId);
      const opts = optionIds.flatMap((id) => optionById.get(id) ?? []);
      if (!menu || opts.length !== optionIds.length) return [];
      return [{ menu, options: opts, quantity, unitPrice: menu.price + opts.reduce((sum, o) => sum + o.price, 0) }];
    });
  const totalCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totalAmount = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  // 차감될 재료 (packages/core 의 applyOptions·saleDeductions — DB 함수 record_sales 와 같은 계산)
  const deductions = mergeDeltas(
    lines.flatMap((l) => saleDeductions(applyOptions(l.menu.recipe, l.options.flatMap((o) => o.rules)), l.quantity)),
  );
  const noRecipe = [...new Set(lines.filter((l) => l.menu.recipe.length === 0).map((l) => l.menu.name))];

  const q = query.trim().toLowerCase();
  const visibleMenus = menus.filter((m) => !q || m.name.toLowerCase().includes(q));
  const optionLines = (menuId: string) =>
    Object.keys(quantities)
      .map((key) => ({ key, ...parseKey(key) }))
      .filter((l) => l.menuId === menuId && l.optionIds.length > 0);

  return (
    <form {...formProps} className="grid gap-4">
      <input type="hidden" name="date" value={date} />
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(
          lines.map((l) => ({ menuId: l.menu.id, quantity: l.quantity, optionIds: l.options.map((o) => o.id) })),
        )}
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
          const key = lineKey(menu.id, []);
          const isPicking = picking?.menuId === menu.id;
          return (
            <li key={menu.id} className="grid gap-1 py-2">
              <div className="flex items-center gap-2">
                <div className="grid min-w-0 flex-1">
                  <span className={cn("truncate text-sm", (quantities[key] ?? 0) > 0 && "font-medium")}>{menu.name}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {won(menu.price)}
                    {menu.recipe.length === 0 && <Badge variant="outline">레시피 없음</Badge>}
                  </span>
                </div>
                {options.length > 0 && (
                  <Button
                    type="button"
                    variant={isPicking ? "secondary" : "ghost"}
                    size="icon"
                    aria-label={`${menu.name} 옵션 붙이기`}
                    aria-expanded={isPicking}
                    onClick={() => setPicking(isPicking ? null : { menuId: menu.id, optionIds: [] })}
                  >
                    <SlidersHorizontal />
                  </Button>
                )}
                <QuantityStepper label={menu.name} value={quantities[key] ?? 0} onChange={(v) => setQuantity(key, v)} />
              </div>

              {isPicking && (
                <div className="grid gap-2 rounded-lg border bg-muted/30 p-3" role="group" aria-label={`${menu.name} 옵션`}>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {options.map((o) => (
                      <label key={o.id} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={picking.optionIds.includes(o.id)}
                          onChange={(e) =>
                            setPicking({
                              menuId: menu.id,
                              optionIds: e.target.checked
                                ? [...picking.optionIds, o.id]
                                : picking.optionIds.filter((id) => id !== o.id),
                            })
                          }
                        />
                        {o.name}
                        {o.price > 0 && <span className="text-xs text-muted-foreground">+{won(o.price)}</span>}
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPicking(null)}>
                      닫기
                    </Button>
                    <Button type="button" size="sm" disabled={picking.optionIds.length === 0} onClick={addOptionLine}>
                      옵션 붙여 1개 더하기
                    </Button>
                  </div>
                </div>
              )}

              {optionLines(menu.id).map((l) => {
                const opts = l.optionIds.flatMap((id) => optionById.get(id) ?? []);
                const optionNames = opts.map((o) => o.name).sort((a, b) => a.localeCompare(b, "ko"));
                const name = optionLineName(menu.name, optionNames);
                const unitPrice = menu.price + opts.reduce((sum, o) => sum + o.price, 0);
                return (
                  <div key={l.key} className="flex items-center gap-2 pl-4">
                    <div className="grid min-w-0 flex-1">
                      {/* 메뉴 줄 바로 아래라 메뉴 이름은 빼고 옵션만. 길면 줄을 바꾼다 */}
                      <span className="text-sm font-medium break-keep">+ {optionNames.join(" + ")}</span>
                      <span className="text-xs text-muted-foreground">{won(unitPrice)}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`${name} 줄 지우기`}
                      onClick={() => removeLine(l.key)}
                    >
                      <X />
                    </Button>
                    <QuantityStepper label={name} value={quantities[l.key] ?? 0} onChange={(v) => setQuantity(l.key, v)} />
                  </div>
                );
              })}
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
            <p className="text-xs text-muted-foreground">{noRecipe.join(", ")}은(는) 레시피가 없어 재료가 차감되지 않습니다.</p>
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

/** − 수량 + (label 은 메뉴 이름 또는 옵션 줄 이름) */
function QuantityStepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`${label} 하나 빼기`}
        disabled={value === 0}
        onClick={() => onChange(value - 1)}
      >
        <Minus />
      </Button>
      <Input
        inputMode="numeric"
        aria-label={`${label} 판매 수량`}
        value={value === 0 ? "" : String(value)}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9]/g, "")))}
        className="w-14 text-center tabular-nums"
      />
      <Button type="button" variant="outline" size="icon" aria-label={`${label} 하나 더하기`} onClick={() => onChange(value + 1)}>
        <Plus />
      </Button>
    </div>
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
  const saleName = optionLineName(sale.menuName, sale.optionNames);
  return (
    <ActionButton
      action={cancelSaleAction}
      fields={{ saleId: sale.id }}
      confirmMessage={
        sale.quantity < 0
          ? `${saleName} ${-sale.quantity}개 취소 기록을 지울까요? 되돌렸던 재료가 다시 차감되고 매출에 다시 들어갑니다.`
          : `${saleName} ${sale.quantity}개 판매를 취소할까요? 차감된 재료도 되돌아갑니다.`
      }
      variant="ghost"
      size="sm"
      pendingText="취소 중…"
      aria-label={sale.quantity < 0 ? `${saleName} 취소 기록 지우기` : `${saleName} 판매 취소`}
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
          <span className="text-sm font-medium">{optionLineName(sale.menuName, sale.optionNames)}</span>
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
