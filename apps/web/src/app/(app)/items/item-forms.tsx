"use client";

import { BASE_UNIT_LABEL, formatQuantity, oneUnitLabel, type BaseUnit } from "@cafe/core";
import { Archive, ArchiveRestore, Star, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import {
  ActionButton,
  Field,
  FormMessage,
  NativeSelect,
  SubmitButton,
  useFormAction,
  useToastResult,
} from "@/components/form-parts";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { Category, Item, ItemUnitInfo } from "@/lib/api/catalog";
import type { Supplier } from "@/lib/api/suppliers";
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

// ---------------------------------------------------------------- 품목 정보

function savedVersion(item: Item) {
  const { name, categoryId, defaultSupplierId, baseUnit, minStock, trackExpiry, barcode, memo } = item;
  return JSON.stringify([name, categoryId, defaultSupplierId, baseUnit, minStock, trackExpiry, barcode, memo]);
}

export function ItemForm({
  item,
  categories,
  suppliers,
  baseUnitLocked = false,
  readOnly = false,
}: {
  /** 없으면 새 품목 만들기 */
  item?: Item;
  categories: Category[];
  /** 기본 거래처 선택지 (보관 제외) */
  suppliers: Pick<Supplier, "id" | "name">[];
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
        <Field label="기본 거래처 (선택)" htmlFor="item-supplier" hint="발주서를 쓸 때 이 거래처의 부족 품목으로 추천합니다.">
          <NativeSelect id="item-supplier" name="defaultSupplierId" defaultValue={item?.defaultSupplierId ?? ""}>
            <option value="">없음</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
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
  useToastResult(defaultState);

  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <span className="text-sm font-medium">{oneUnitLabel(unit.name)}</span>
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
          <ActionButton
            action={deleteItemUnitAction}
            fields={{ itemId, unitId: unit.id }}
            confirmMessage={`'${unit.name}' 단위를 삭제할까요?`}
            variant="ghost"
            size="icon-sm"
            pendingText="…"
            aria-label={`${unit.name} 단위 삭제`}
          >
            <Trash2 />
          </ActionButton>
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
