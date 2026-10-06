"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { ActionButton, FormMessage, SubmitButton, useFormAction, useToastResult } from "@/components/form-parts";
import { Input } from "@/components/ui/input";
import type { Category } from "@/lib/api/catalog";
import {
  createCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  renameCategoryAction,
} from "../actions";

export function AddCategoryForm() {
  const { state, pending, formProps } = useFormAction(createCategoryAction, { resetOnSuccess: true });
  useToastResult(state?.ok ? state : undefined);

  return (
    <form {...formProps} className="grid gap-2">
      <div className="flex gap-2">
        <Input name="name" placeholder="예) 원두, 유제품, 시럽, 소모품" maxLength={30} required aria-label="카테고리 이름" />
        <SubmitButton pending={pending} pendingText="추가 중…">
          추가
        </SubmitButton>
      </div>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}

export function CategoryRow({ category, itemCount, isFirst, isLast }: {
  category: Category;
  itemCount: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [renameState, renameAction] = useActionState(renameCategoryAction, undefined);
  const [moveState, moveAction] = useActionState(moveCategoryAction, undefined);
  useToastResult(renameState);
  useToastResult(moveState);

  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <form action={renameAction} className="flex min-w-0 flex-1 items-center gap-2">
        <input type="hidden" name="categoryId" value={category.id} />
        <Input
          name="name"
          defaultValue={category.name}
          maxLength={30}
          required
          aria-label={`${category.name} 이름`}
          className="max-w-48"
        />
        <SubmitButton variant="ghost" size="sm" pendingText="저장 중…">
          이름 저장
        </SubmitButton>
        <span className="shrink-0 text-xs text-muted-foreground">품목 {itemCount}개</span>
      </form>
      <div className="ml-auto flex gap-1">
        {!isFirst ? (
          <form action={moveAction}>
            <input type="hidden" name="categoryId" value={category.id} />
            <input type="hidden" name="direction" value="up" />
            <SubmitButton variant="ghost" size="icon-sm" pendingText="…" aria-label={`${category.name} 위로`}>
              <ArrowUp />
            </SubmitButton>
          </form>
        ) : (
          <span className="size-7" />
        )}
        {!isLast ? (
          <form action={moveAction}>
            <input type="hidden" name="categoryId" value={category.id} />
            <input type="hidden" name="direction" value="down" />
            <SubmitButton variant="ghost" size="icon-sm" pendingText="…" aria-label={`${category.name} 아래로`}>
              <ArrowDown />
            </SubmitButton>
          </form>
        ) : (
          <span className="size-7" />
        )}
        <ActionButton
          action={deleteCategoryAction}
          fields={{ categoryId: category.id }}
          confirmMessage={`'${category.name}' 카테고리를 삭제할까요?${itemCount > 0 ? ` 속한 품목 ${itemCount}개는 미분류가 됩니다.` : ""}`}
          variant="ghost"
          size="icon-sm"
          pendingText="…"
          aria-label={`${category.name} 삭제`}
        >
          <Trash2 />
        </ActionButton>
      </div>
    </li>
  );
}
