"use client";

import { BASE_UNIT_LABEL, formatQuantity } from "@cafe/core";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
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
import { PercentInput } from "@/components/percent-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Item } from "@/lib/api/catalog";
import type { Menu, RecipeLine } from "@/lib/api/menus";
import {
  createMenuAction,
  removeIngredientAction,
  setIngredientAction,
  setMenuArchivedAction,
  updateMenuAction,
} from "./actions";

export type IngredientOption = Pick<Item, "id" | "name" | "categoryName" | "baseUnit" | "units">;

function WonInput(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Input inputMode="numeric" autoComplete="off" {...props} className="pr-8" />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
        원
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- 메뉴 정보

export function MenuForm({ menu, storeTargetRate, readOnly = false }: {
  menu?: Menu;
  /** 매장 기본 목표 원가율(%) */
  storeTargetRate: number;
  readOnly?: boolean;
}) {
  const { state, pending, formProps } = useFormAction(menu ? updateMenuAction : createMenuAction);
  useToastResult(menu ? state : undefined);

  return (
    <form {...formProps} className="grid gap-4">
      {menu && <input type="hidden" name="menuId" value={menu.id} />}
      {/* 저장된 값이 바뀌면 입력칸을 새로 그려 저장된 값을 보여준다. 폼의 액션 결과는 유지된다. */}
      <fieldset
        key={menu && `${menu.name}:${menu.price}:${menu.targetCostRate}`}
        disabled={readOnly}
        className="grid gap-4 sm:grid-cols-[1fr_10rem_10rem]"
      >
        <Field label="메뉴 이름" htmlFor="menu-name">
          <Input id="menu-name" name="name" defaultValue={menu?.name} placeholder="예) 아메리카노" maxLength={50} required />
        </Field>
        <Field label="가격" htmlFor="menu-price">
          <WonInput id="menu-price" name="price" defaultValue={menu?.price ?? ""} placeholder="4500" required />
        </Field>
        <Field label="목표 원가율" htmlFor="menu-target-cost-rate" hint={`비우면 매장 기본 ${storeTargetRate}%`}>
          <PercentInput
            id="menu-target-cost-rate"
            name="targetCostRate"
            defaultValue={menu?.targetCostRate ?? ""}
            placeholder={String(storeTargetRate)}
          />
        </Field>
      </fieldset>
      {!readOnly && (
        <>
          {!menu && <FormMessage state={state} />}
          <div className="flex justify-end">
            <SubmitButton pending={pending} pendingText="저장 중…">
              {menu ? "저장" : "메뉴 만들기"}
            </SubmitButton>
          </div>
        </>
      )}
    </form>
  );
}

export function ArchiveMenuButton({ menuId, archived }: { menuId: string; archived: boolean }) {
  const [state, action] = useActionState(setMenuArchivedAction, undefined);
  useToastResult(state);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!archived && !confirm("이 메뉴를 보관할까요? 판매 입력에서 숨겨지고, 지난 판매 기록은 그대로 남습니다.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="menuId" value={menuId} />
      <input type="hidden" name="archived" value={String(!archived)} />
      <SubmitButton variant="outline" size="sm" pendingText="처리 중…">
        {archived ? <ArchiveRestore /> : <Archive />}
        {archived ? "다시 판매" : "보관"}
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------- 레시피

export function RecipeEditor({ menu, items, costs, readOnly }: {
  menu: Menu;
  /** 레시피에 넣을 수 있는 품목 (보관 제외, 카테고리 순) */
  items: IngredientOption[];
  /** 품목별 최근 입고 단가 (기본 단위 1개당 원) */
  costs: Record<string, number>;
  readOnly: boolean;
}) {
  const { state, pending, formProps } = useFormAction(setIngredientAction);
  useToastResult(state?.ok ? state : undefined);

  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");

  // 저장에 성공하면 사용량 칸을 비운다.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) {
      setQuantity("");
      setUnitId("");
    }
  }

  const item = items.find((i) => i.id === itemId);
  const isInRecipe = menu.recipe.some((r) => r.itemId === itemId);

  const startEdit = (line: RecipeLine) => {
    setItemId(line.itemId);
    setUnitId("");
    setQuantity(String(line.quantity));
    document.getElementById("recipe-quantity")?.focus();
  };

  const groups = new Map<string, IngredientOption[]>();
  for (const i of items) {
    const key = i.categoryName ?? "미분류";
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }

  return (
    <div className="grid gap-4">
      {menu.recipe.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          아직 재료가 없습니다. 재료를 넣으면 판매할 때 재고에서 자동으로 차감됩니다.
        </p>
      ) : (
        <ul className="divide-y">
          {menu.recipe.map((line) => {
            const unitCost = costs[line.itemId];
            return (
              <li key={line.itemId} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="text-sm font-medium">{line.itemName}</span>
                {line.itemArchived && <Badge variant="outline">보관된 품목</Badge>}
                <span className="text-sm tabular-nums">{formatQuantity(line.quantity, line.baseUnit)}</span>
                <span className="text-xs text-muted-foreground">
                  {unitCost === undefined
                    ? "입고 단가 없음"
                    : `≈ ${Math.round(line.quantity * unitCost).toLocaleString("ko-KR")}원`}
                </span>
                {!readOnly && (
                  <div className="ml-auto flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${line.itemName} 사용량 수정`}
                      onClick={() => startEdit(line)}
                    >
                      <Pencil />
                    </Button>
                    <ActionButton
                      action={removeIngredientAction}
                      fields={{ menuId: menu.id, itemId: line.itemId }}
                      variant="ghost"
                      size="icon-sm"
                      pendingText="…"
                      aria-label={`${line.itemName} 빼기`}
                    >
                      <Trash2 />
                    </ActionButton>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly && items.length > 0 && item && (
        <form {...formProps} className="grid gap-3 rounded-lg border border-dashed p-3">
          <input type="hidden" name="menuId" value={menu.id} />
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem_7rem_auto] sm:items-end">
            <Field label="재료" htmlFor="recipe-item">
              <NativeSelect
                id="recipe-item"
                name="itemId"
                value={itemId}
                onChange={(e) => {
                  setItemId(e.target.value);
                  setUnitId("");
                }}
              >
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
            <Field label="1개당 사용량" htmlFor="recipe-quantity">
              <Input
                id="recipe-quantity"
                name="quantity"
                inputMode="decimal"
                autoComplete="off"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                required
              />
            </Field>
            <Field label="단위" htmlFor="recipe-unit">
              <NativeSelect id="recipe-unit" name="unitId" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">{BASE_UNIT_LABEL[item.baseUnit]}</option>
                {item.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <SubmitButton pending={pending} pendingText="저장 중…">
              {isInRecipe ? "사용량 바꾸기" : "재료 넣기"}
            </SubmitButton>
          </div>
          {isInRecipe && <p className="text-xs text-muted-foreground">이미 들어 있는 재료입니다. 저장하면 사용량이 바뀝니다.</p>}
          {state?.error && <FormMessage state={state} />}
        </form>
      )}
      {!readOnly && items.length === 0 && (
        <p className="text-sm text-muted-foreground">레시피에 넣을 품목이 없습니다. 품목을 먼저 등록해 주세요.</p>
      )}
    </div>
  );
}
