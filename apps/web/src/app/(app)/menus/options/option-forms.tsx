"use client";

import { BASE_UNIT_LABEL } from "@cafe/core";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
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
import type { MenuOption, OptionRuleKind } from "@/lib/api/options";
import { RULE_KIND_LABEL, ruleText } from "@/lib/option-text";
import type { IngredientOption } from "../menu-forms";
import {
  addOptionRuleAction,
  createOptionAction,
  removeOptionRuleAction,
  setOptionArchivedAction,
  updateOptionAction,
} from "./actions";

// ---------------------------------------------------------------- 옵션 정보

export function OptionForm({ option, readOnly = false }: { option?: MenuOption; readOnly?: boolean }) {
  const { state, pending, formProps } = useFormAction(option ? updateOptionAction : createOptionAction);
  useToastResult(option ? state : undefined);

  return (
    <form {...formProps} className="grid gap-4">
      {option && <input type="hidden" name="optionId" value={option.id} />}
      <fieldset
        key={option && `${option.name}:${option.price}`}
        disabled={readOnly}
        className="grid gap-4 sm:grid-cols-[1fr_12rem]"
      >
        <Field label="옵션 이름" htmlFor="option-name" hint="판매 입력과 CSV 의 옵션 이름과 맞추면 찾기 쉽습니다.">
          <Input id="option-name" name="name" defaultValue={option?.name} placeholder="예) 샷 추가" maxLength={50} required />
        </Field>
        <Field label="추가 금액" htmlFor="option-price" hint="없으면 비워 두세요.">
          <div className="relative">
            <Input
              id="option-price"
              name="price"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={option?.price || ""}
              placeholder="0"
              className="pr-8"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
              원
            </span>
          </div>
        </Field>
      </fieldset>
      {!readOnly && (
        <>
          {!option && <FormMessage state={state} />}
          <div className="flex justify-end">
            <SubmitButton pending={pending} pendingText="저장 중…">
              {option ? "저장" : "옵션 만들기"}
            </SubmitButton>
          </div>
        </>
      )}
    </form>
  );
}

export function ArchiveOptionButton({ optionId, archived }: { optionId: string; archived: boolean }) {
  const [state, action] = useActionState(setOptionArchivedAction, undefined);
  useToastResult(state);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!archived && !confirm("이 옵션을 보관할까요? 판매 입력에서 숨겨지고, 지난 판매 기록은 그대로 남습니다.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="optionId" value={optionId} />
      <input type="hidden" name="archived" value={String(!archived)} />
      <SubmitButton variant="outline" size="sm" pendingText="처리 중…">
        {archived ? <ArchiveRestore /> : <Archive />}
        {archived ? "다시 쓰기" : "보관"}
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------- 재료 규칙

const KIND_HINT: Record<OptionRuleKind, string> = {
  add: "메뉴 레시피에 더합니다. 예) 샷 추가: 원두 +18g",
  replace: "메뉴 레시피에 원래 재료가 있으면 같은 양의 다른 재료로 바꿉니다. 예) 오트밀크 변경: 우유 → 오트밀크",
  scale: "메뉴 레시피에 그 재료가 있으면 양을 몇 배로 합니다. 예) 사이즈업: 우유 ×1.5 (컵은 '바꾸기'로 큰 컵)",
};

function ItemSelect({ id, name, items, value, onChange }: {
  id: string;
  name: string;
  items: IngredientOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const groups = new Map<string, IngredientOption[]>();
  for (const i of items) {
    const key = i.categoryName ?? "미분류";
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return (
    <NativeSelect id={id} name={name} value={value} onChange={(e) => onChange(e.target.value)}>
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
  );
}

export function RuleEditor({ option, items, readOnly }: {
  option: MenuOption;
  /** 규칙에 쓸 수 있는 품목 (보관 제외, 카테고리 순) */
  items: IngredientOption[];
  readOnly: boolean;
}) {
  const { state, pending, formProps } = useFormAction(addOptionRuleAction);
  useToastResult(state?.ok ? state : undefined);

  const [kind, setKind] = useState<OptionRuleKind>("add");
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [fromItemId, setFromItemId] = useState(items[0]?.id ?? "");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");

  // 저장에 성공하면 수량 칸을 비운다.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setQuantity("");
  }

  const item = items.find((i) => i.id === itemId);

  return (
    <div className="grid gap-4">
      {option.rules.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          아직 규칙이 없습니다. 규칙이 없으면 이 옵션은 재료를 바꾸지 않고 금액만 더합니다.
        </p>
      ) : (
        <ul className="divide-y">
          {option.rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2.5 text-sm">
              <Badge variant="outline">{RULE_KIND_LABEL[r.kind]}</Badge>
              <span className="font-medium tabular-nums">{ruleText(r)}</span>
              {!readOnly && (
                <div className="ml-auto">
                  <ActionButton
                    action={removeOptionRuleAction}
                    fields={{ optionId: option.id, ruleId: r.id }}
                    variant="ghost"
                    size="icon-sm"
                    pendingText="…"
                    aria-label={`${ruleText(r)} 지우기`}
                  >
                    <Trash2 />
                  </ActionButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && items.length > 0 && (
        <form {...formProps} className="grid gap-3 rounded-lg border border-dashed p-3">
          <input type="hidden" name="optionId" value={option.id} />
          <Field label="규칙" htmlFor="rule-kind" hint={KIND_HINT[kind]}>
            <NativeSelect id="rule-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as OptionRuleKind)}>
              <option value="add">추가 — 재료를 더 넣는다</option>
              <option value="replace">바꾸기 — 재료를 다른 재료로</option>
              <option value="scale">늘리기 — 재료를 몇 배로</option>
            </NativeSelect>
          </Field>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            {kind === "replace" && (
              <Field label="원래 재료" htmlFor="rule-from-item">
                <ItemSelect id="rule-from-item" name="fromItemId" items={items} value={fromItemId} onChange={setFromItemId} />
              </Field>
            )}
            <Field label={kind === "replace" ? "바꿀 재료" : "재료"} htmlFor="rule-item">
              <ItemSelect
                id="rule-item"
                name="itemId"
                items={items}
                value={itemId}
                onChange={(v) => {
                  setItemId(v);
                  setUnitId("");
                }}
              />
            </Field>
            {kind === "add" && item && (
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <Field label="1개당 추가량" htmlFor="rule-quantity">
                  <Input
                    id="rule-quantity"
                    name="quantity"
                    inputMode="decimal"
                    autoComplete="off"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0"
                    required
                  />
                </Field>
                <Field label="단위" htmlFor="rule-unit">
                  <NativeSelect id="rule-unit" name="unitId" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                    <option value="">{BASE_UNIT_LABEL[item.baseUnit]}</option>
                    {item.units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            )}
            {kind === "scale" && (
              <Field label="몇 배" htmlFor="rule-quantity">
                <div className="relative">
                  <Input
                    id="rule-quantity"
                    name="quantity"
                    inputMode="decimal"
                    autoComplete="off"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="1.5"
                    className="pr-8"
                    required
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                    배
                  </span>
                </div>
              </Field>
            )}
            <SubmitButton pending={pending} pendingText="저장 중…">
              규칙 넣기
            </SubmitButton>
          </div>
          {state?.error && <FormMessage state={state} />}
        </form>
      )}
      {!readOnly && items.length === 0 && (
        <p className="text-sm text-muted-foreground">규칙에 쓸 품목이 없습니다. 품목을 먼저 등록해 주세요.</p>
      )}
    </div>
  );
}
