"use client";

import { BASE_UNIT_LABEL, formatQuantity, oneUnitLabel, roundQty, WASTE_REASONS, type WasteReason } from "@cafe/core";
import { useState } from "react";
import { Field, FormMessage, NativeSelect, SubmitButton, useFormAction, useToastResult } from "@/components/form-parts";
import { Input } from "@/components/ui/input";
import type { Item } from "@/lib/api/catalog";
import type { ManualMovementType } from "@/lib/api/stock";
import { cn } from "@/lib/utils";
import { recordMovementAction } from "./actions";

export type StockItem = Pick<Item, "id" | "name" | "categoryName" | "baseUnit" | "trackExpiry" | "units">;

const TYPE_OPTIONS: { value: ManualMovementType; label: string }[] = [
  { value: "receive", label: "입고" },
  { value: "consume", label: "사용" },
  { value: "waste", label: "폐기" },
  { value: "adjust", label: "조정" },
];

const MEMO_PLACEHOLDER: Record<ManualMovementType, string> = {
  receive: "예) 거래처, 영수증 번호",
  consume: "예) 행사용",
  waste: "예) 마감 때 남은 우유",
  adjust: "조정 사유 (예: 입고 수량을 잘못 입력함)",
};

/** 입고는 기본 입고 단위, 나머지는 기본 단위로 시작한다. */
function defaultUnitId(type: ManualMovementType, item: StockItem | undefined): string {
  if (!item || type !== "receive") return "";
  return item.units.find((u) => u.isDefaultPurchase)?.id ?? "";
}

/** 버튼 여러 개 중 하나를 고르는 칸 */
function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2 py-1.5 text-sm transition-colors",
            value === o.value
              ? "bg-background font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StockForm({ items, stock, canAdjust, initialItemId }: {
  items: StockItem[];
  /** 품목별 현재 재고 (기본 단위) */
  stock: Record<string, number>;
  canAdjust: boolean;
  initialItemId?: string;
}) {
  const { state, pending, formProps } = useFormAction(recordMovementAction);
  useToastResult(state?.ok ? state : undefined);

  const firstItem = items.find((i) => i.id === initialItemId) ?? items[0];
  const [type, setType] = useState<ManualMovementType>("receive");
  const [itemId, setItemId] = useState(firstItem?.id ?? "");
  const [unitId, setUnitId] = useState(defaultUnitId("receive", firstItem));
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [memo, setMemo] = useState("");
  // 폐기 사유는 기록 뒤에도 남겨 둔다 (마감 때 같은 사유로 여러 품목을 버리는 경우가 많다)
  const [wasteReason, setWasteReason] = useState<WasteReason | "">("");

  // 기록에 성공하면 수량 칸들을 비운다. 종류·품목은 그대로 두어 이어서 입력하기 쉽게 한다.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) {
      setQuantity("");
      setUnitPrice("");
      setExpiresOn("");
      setMemo("");
    }
  }

  const item = items.find((i) => i.id === itemId);
  if (!item) return null;

  const unit = item.units.find((u) => u.id === unitId);
  const unitName = unit?.name ?? BASE_UNIT_LABEL[item.baseUnit];
  const defaultUnit = item.units.find((u) => u.isDefaultPurchase) ?? null;
  const types = TYPE_OPTIONS.filter((t) => t.value !== "adjust" || canAdjust);

  // 미리보기: 기본 단위 환산과 기록 후 재고
  const entered = Number(quantity.replace(/,/g, ""));
  const base = quantity.trim() && Number.isFinite(entered) && entered > 0 ? roundQty(entered * (unit?.factor ?? 1)) : null;
  const sign = type === "receive" || (type === "adjust" && direction === "increase") ? 1 : -1;
  const current = stock[item.id] ?? 0;
  const after = base === null ? null : roundQty(current + sign * base);
  const fmt = (n: number) => formatQuantity(n, item.baseUnit, defaultUnit);
  const isIncoming = sign > 0;

  const changeType = (next: ManualMovementType) => {
    setType(next);
    setUnitId(defaultUnitId(next, item));
  };
  const changeItem = (nextId: string) => {
    setItemId(nextId);
    setUnitId(defaultUnitId(type, items.find((i) => i.id === nextId)));
  };

  // 카테고리별로 묶어 보여준다. (items 는 카테고리 순서대로 정렬되어 들어온다)
  const groups = new Map<string, StockItem[]>();
  for (const i of items) {
    const key = i.categoryName ?? "미분류";
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }

  return (
    <form {...formProps} className="grid gap-4">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="direction" value={direction} />

      <Segmented label="기록 종류" value={type} options={types} onChange={changeType} />

      <Field label="품목" htmlFor="stock-item">
        <NativeSelect id="stock-item" name="itemId" value={itemId} onChange={(e) => changeItem(e.target.value)}>
          {[...groups].map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
      </Field>

      {type === "adjust" && (
        <Segmented
          label="조정 방향"
          value={direction}
          options={[
            { value: "decrease", label: "줄이기 (−)" },
            { value: "increase", label: "늘리기 (+)" },
          ]}
          onChange={setDirection}
        />
      )}

      <div className="grid grid-cols-[1fr_8rem] gap-2">
        <Field label="수량" htmlFor="stock-quantity">
          <Input
            id="stock-quantity"
            name="quantity"
            inputMode="decimal"
            autoComplete="off"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            required
          />
        </Field>
        <Field label="단위" htmlFor="stock-unit">
          <NativeSelect id="stock-unit" name="unitId" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">{BASE_UNIT_LABEL[item.baseUnit]}</option>
            {item.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({formatQuantity(u.factor, item.baseUnit)})
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="grid gap-0.5 rounded-lg bg-muted/50 px-3 py-2 text-sm" aria-live="polite">
        <p className="text-muted-foreground">
          현재 재고 <span className="font-medium text-foreground">{fmt(current)}</span>
          {after !== null && (
            <>
              {" → 기록 후 "}
              <span className={cn("font-medium", after < 0 ? "text-destructive" : "text-foreground")}>{fmt(after)}</span>
              {unit && <span> ({sign > 0 ? "+" : "−"}{formatQuantity(base!, item.baseUnit)})</span>}
            </>
          )}
        </p>
        {after !== null && after < 0 && (
          <p className="text-xs text-destructive">재고가 마이너스가 됩니다. 빠뜨린 입고 기록이 없는지 확인해 주세요.</p>
        )}
      </div>

      {type === "receive" && (
        <Field label={`단가 (${oneUnitLabel(unitName)}당, 선택)`} htmlFor="stock-price" hint="원가 계산에 쓰입니다.">
          <div className="relative">
            <Input
              id="stock-price"
              name="unitPrice"
              inputMode="numeric"
              autoComplete="off"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0"
              className="pr-8"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
              원
            </span>
          </div>
        </Field>
      )}

      {item.trackExpiry && isIncoming && (
        <Field
          label={type === "receive" ? "유통기한" : "유통기한 (선택)"}
          htmlFor="stock-expires"
          hint="사용·폐기할 때 유통기한이 빠른 것부터 차감합니다."
        >
          <Input
            id="stock-expires"
            name="expiresOn"
            type="date"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            required={type === "receive"}
          />
        </Field>
      )}

      {type === "waste" && (
        <Field
          label="폐기 사유"
          htmlFor="stock-waste-reason"
          hint={WASTE_REASONS.find((r) => r.value === wasteReason)?.hint ?? "리포트에서 사유별 폐기 금액을 볼 수 있습니다."}
        >
          <NativeSelect
            id="stock-waste-reason"
            name="wasteReason"
            value={wasteReason}
            onChange={(e) => setWasteReason(e.target.value as WasteReason | "")}
            required
          >
            <option value="" disabled>
              사유를 골라 주세요
            </option>
            {WASTE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}

      <Field
        label={type === "adjust" ? "사유" : type === "waste" && wasteReason === "other" ? "메모 (기타 사유)" : "메모 (선택)"}
        htmlFor="stock-memo"
      >
        <Input
          id="stock-memo"
          name="memo"
          maxLength={500}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder={MEMO_PLACEHOLDER[type]}
          required={type === "adjust" || (type === "waste" && wasteReason === "other")}
        />
      </Field>

      {state?.error && <FormMessage state={state} />}
      <SubmitButton pending={pending} pendingText="기록 중…" className="w-full" size="lg">
        {TYPE_OPTIONS.find((t) => t.value === type)!.label} 기록
      </SubmitButton>
    </form>
  );
}
