"use client";

import { BASE_UNIT_LABEL, formatQuantity, type BaseUnit } from "@cafe/core";
import { Archive, ArchiveRestore, ChevronRight, Search, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Field, FormMessage, NativeSelect, SubmitButton, useFormAction, useToastResult } from "@/components/form-parts";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Category, Item, ItemUnitInfo } from "@/lib/api/catalog";
import { cn } from "@/lib/utils";
import {
  addItemUnitAction,
  createItemAction,
  deleteItemUnitAction,
  setDefaultUnitAction,
  setItemArchivedAction,
  updateItemAction,
} from "./actions";

const BASE_UNIT_OPTIONS: { value: BaseUnit; label: string }[] = [
  { value: "g", label: "g (무게)" },
  { value: "ml", label: "ml (부피)" },
  { value: "ea", label: "개 (개수)" },
];

function defaultUnit(units: ItemUnitInfo[]) {
  return units.find((u) => u.isDefaultPurchase) ?? null;
}

/** 입력칸 오른쪽에 단위를 붙여 보여준다. */
function UnitInput({ unit, ...props }: React.ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className="relative">
      <Input {...props} className="pr-10" />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
        {unit}
      </span>
    </div>
  );
}

function Checkbox({ id, name, defaultChecked, label, hint }: {
  id: string;
  name: string;
  defaultChecked?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-primary" />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 목록

export function ItemList({ items, categories }: { items: Item[]; categories: Category[] }) {
  const [query, setQuery] = useState("");
  /** "all" | "none"(미분류) | 카테고리 ID */
  const [categoryId, setCategoryId] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = items.filter((i) => i.archivedAt).length;
  const hasUncategorized = items.some((i) => !i.categoryId && !i.archivedAt);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!showArchived && item.archivedAt) return false;
      if (categoryId === "none" ? item.categoryId : categoryId !== "all" && item.categoryId !== categoryId) {
        return false;
      }
      return !q || item.name.toLowerCase().includes(q) || item.barcode?.includes(q);
    });
  }, [items, query, categoryId, showArchived]);

  const filters = [
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
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setCategoryId(f.id)}
            aria-pressed={categoryId === f.id}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
              categoryId === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "아직 등록한 품목이 없습니다." : "조건에 맞는 품목이 없습니다."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {visible.map((item) => (
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
                    {item.trackExpiry && <Badge variant="outline">유통기한</Badge>}
                    {item.archivedAt && <Badge variant="outline">보관됨</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    기본 단위 {BASE_UNIT_LABEL[item.baseUnit]}
                    {item.units.length > 0 &&
                      ` · ${item.units.map((u) => `${u.name}(${formatQuantity(u.factor, item.baseUnit)})`).join(", ")}`}
                    {item.minStock > 0 &&
                      ` · 부족 기준 ${formatQuantity(item.minStock, item.baseUnit, defaultUnit(item.units))}`}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
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

// ---------------------------------------------------------------- 품목 정보

function savedVersion(item: Item) {
  const { name, categoryId, baseUnit, minStock, trackExpiry, barcode, memo } = item;
  return JSON.stringify([name, categoryId, baseUnit, minStock, trackExpiry, barcode, memo]);
}

export function ItemForm({
  item,
  categories,
  baseUnitLocked = false,
  readOnly = false,
}: {
  /** 없으면 새 품목 만들기 */
  item?: Item;
  categories: Category[];
  /** 입출고·레시피에 쓰인 품목은 기본 단위를 바꿀 수 없다. */
  baseUnitLocked?: boolean;
  readOnly?: boolean;
}) {
  const { state, pending, formProps } = useFormAction(item ? updateItemAction : createItemAction);
  const [baseUnit, setBaseUnit] = useState<BaseUnit>(item?.baseUnit ?? "g");
  useToastResult(item ? state : undefined);

  return (
    <form {...formProps} className="grid gap-4">
      {item && <input type="hidden" name="itemId" value={item.id} />}
      {/* disabled 인 select 는 전송되지 않으므로 잠겨 있을 때는 숨은 값으로 보낸다. */}
      {baseUnitLocked && <input type="hidden" name="baseUnit" value={baseUnit} />}
      {/* 저장된 값이 바뀌면 입력칸을 새로 그려 저장된 값(공백 정리 등)을 보여준다. 폼의 액션 결과는 유지된다. */}
      <fieldset key={item && savedVersion(item)} disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field label="품목 이름" htmlFor="item-name">
          <Input
            id="item-name"
            name="name"
            defaultValue={item?.name}
            placeholder="예) 원두(하우스 블렌드)"
            maxLength={50}
            required
          />
        </Field>
        <Field label="카테고리" htmlFor="item-category">
          <NativeSelect id="item-category" name="categoryId" defaultValue={item?.categoryId ?? ""}>
            <option value="">미분류</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="기본 단위"
          htmlFor="item-base-unit"
          hint={
            baseUnitLocked
              ? "입출고·레시피에 쓰여서 바꿀 수 없습니다."
              : "재고를 셀 가장 작은 단위. 박스·봉 같은 입고 단위는 저장 후 추가합니다."
          }
        >
          <NativeSelect
            id="item-base-unit"
            name={baseUnitLocked ? undefined : "baseUnit"}
            value={baseUnit}
            onChange={(e) => setBaseUnit(e.target.value as BaseUnit)}
            disabled={baseUnitLocked}
          >
            {BASE_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="부족 알림 기준" htmlFor="item-min-stock" hint="재고가 이 수량 이하가 되면 부족으로 표시합니다.">
          <UnitInput
            id="item-min-stock"
            name="minStock"
            inputMode="decimal"
            defaultValue={item?.minStock ?? 0}
            unit={BASE_UNIT_LABEL[baseUnit]}
          />
        </Field>
        <Field label="바코드 (선택)" htmlFor="item-barcode">
          <Input id="item-barcode" name="barcode" defaultValue={item?.barcode ?? ""} maxLength={50} />
        </Field>
        <div className="sm:pt-7">
          <Checkbox
            id="item-track-expiry"
            name="trackExpiry"
            defaultChecked={item?.trackExpiry}
            label="유통기한 관리"
            hint="입고할 때 유통기한을 받고, 기한이 빠른 것부터 사용합니다."
          />
        </div>
        <div className="sm:col-span-2">
          <Field label="메모 (선택)" htmlFor="item-memo">
            <textarea
              id="item-memo"
              name="memo"
              defaultValue={item?.memo ?? ""}
              maxLength={500}
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm dark:bg-input/30"
            />
          </Field>
        </div>
      </fieldset>
      {!readOnly && (
        <>
          {!item && <FormMessage state={state} />}
          <div className="flex justify-end">
            <SubmitButton pending={pending} pendingText="저장 중…">
              {item ? "저장" : "품목 만들기"}
            </SubmitButton>
          </div>
        </>
      )}
    </form>
  );
}

export function ArchiveItemButton({ itemId, archived }: { itemId: string; archived: boolean }) {
  const [state, action] = useActionState(setItemArchivedAction, undefined);
  useToastResult(state);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!archived && !confirm("이 품목을 보관할까요? 목록과 입출고 화면에서 숨겨지고, 지난 기록은 그대로 남습니다.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="archived" value={String(!archived)} />
      <SubmitButton variant="outline" size="sm" pendingText="처리 중…">
        {archived ? <ArchiveRestore /> : <Archive />}
        {archived ? "다시 사용" : "보관"}
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------- 입고 단위

function UnitRow({ itemId, unit, baseUnit, readOnly }: {
  itemId: string;
  unit: ItemUnitInfo;
  baseUnit: BaseUnit;
  readOnly: boolean;
}) {
  const [defaultState, defaultAction] = useActionState(setDefaultUnitAction, undefined);
  const [deleteState, deleteAction] = useActionState(deleteItemUnitAction, undefined);
  useToastResult(defaultState);
  useToastResult(deleteState);

  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <span className="text-sm font-medium">1{unit.name}</span>
      <span className="text-sm text-muted-foreground">= {formatQuantity(unit.factor, baseUnit)}</span>
      {unit.isDefaultPurchase && <Badge>기본 입고 단위</Badge>}
      {!readOnly && (
        <div className="ml-auto flex gap-1">
          {!unit.isDefaultPurchase && (
            <form action={defaultAction}>
              <input type="hidden" name="itemId" value={itemId} />
              <input type="hidden" name="unitId" value={unit.id} />
              <SubmitButton variant="ghost" size="sm" pendingText="처리 중…">
                <Star />
                기본으로
              </SubmitButton>
            </form>
          )}
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!confirm(`'${unit.name}' 단위를 삭제할까요?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="unitId" value={unit.id} />
            <SubmitButton variant="ghost" size="icon-sm" pendingText="…" aria-label={`${unit.name} 단위 삭제`}>
              <Trash2 />
            </SubmitButton>
          </form>
        </div>
      )}
    </li>
  );
}

export function UnitsEditor({ item, readOnly }: { item: Item; readOnly: boolean }) {
  const { state, pending, formProps } = useFormAction(addItemUnitAction, { resetOnSuccess: true });
  useToastResult(state?.ok ? state : undefined);
  const baseLabel = BASE_UNIT_LABEL[item.baseUnit];

  return (
    <div className="grid gap-4">
      <ul className="divide-y">
        <li className="flex items-center gap-2 py-2.5">
          <span className="text-sm font-medium">{baseLabel}</span>
          <Badge variant="outline">기본 단위</Badge>
        </li>
        {item.units.map((unit) => (
          <UnitRow key={unit.id} itemId={item.id} unit={unit} baseUnit={item.baseUnit} readOnly={readOnly} />
        ))}
      </ul>

      {!readOnly && (
        <form {...formProps} className="grid gap-3 rounded-lg border border-dashed p-3">
          <input type="hidden" name="itemId" value={item.id} />
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="단위 이름" htmlFor="unit-name">
              <Input id="unit-name" name="name" placeholder="예) 봉, 박스, 팩" maxLength={20} required />
            </Field>
            <Field label="1단위에 든 양" htmlFor="unit-factor">
              <UnitInput
                id="unit-factor"
                name="factor"
                inputMode="decimal"
                placeholder={item.baseUnit === "ea" ? "예) 50" : "예) 1000"}
                unit={baseLabel}
                required
              />
            </Field>
            <SubmitButton pending={pending} pendingText="추가 중…">
              단위 추가
            </SubmitButton>
          </div>
          <Checkbox
            id="unit-default"
            name="isDefaultPurchase"
            defaultChecked={item.units.length === 0}
            label="기본 입고 단위로 사용"
            hint="입고할 때 처음 선택되어 있는 단위입니다."
          />
          {state?.error && <FormMessage state={state} />}
        </form>
      )}
    </div>
  );
}
