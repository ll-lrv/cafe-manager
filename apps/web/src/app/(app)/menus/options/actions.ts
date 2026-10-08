"use server";

import { can } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import {
  addOptionRule,
  createOption,
  removeOptionRule,
  setOptionArchived,
  updateOption,
  type OptionInput,
  type OptionRuleKind,
} from "@/lib/api/options";
import { requireCurrentStore } from "@/lib/api/stores";

/** 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB에서는 RLS가 최종 방어) */
async function requireOptionManager() {
  const store = await requireCurrentStore();
  if (!can(store.role, "catalog:manage")) throw new ApiError("옵션 관리는 사장과 매니저만 할 수 있습니다.");
  return store;
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

/** "1,000" 처럼 쉼표가 들어간 숫자도 받는다. 비어 있으면 NaN */
function number(formData: FormData, name: string): number {
  const raw = text(formData, name).replace(/,/g, "");
  return raw === "" ? NaN : Number(raw);
}

function readOptionInput(formData: FormData): OptionInput {
  const price = text(formData, "price");
  return { name: text(formData, "name"), price: price === "" ? 0 : number(formData, "price") };
}

function revalidateOptions(optionId?: string) {
  revalidatePath("/menus", "layout");
  revalidatePath("/sales");
  revalidatePath("/reports/menus");
  if (optionId) revalidatePath(`/menus/options/${optionId}`);
}

export async function createOptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let optionId: string;
  try {
    const store = await requireOptionManager();
    optionId = await createOption(store.storeId, readOptionInput(formData));
  } catch (e) {
    return toActionError(e);
  }
  revalidateOptions();
  redirect(`/menus/options/${optionId}?created=1`);
}

export async function updateOptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireOptionManager();
    const optionId = text(formData, "optionId");
    await updateOption(store.storeId, optionId, readOptionInput(formData));
    revalidateOptions(optionId);
    return { ok: true, message: "저장했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setOptionArchivedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireOptionManager();
    const optionId = text(formData, "optionId");
    const archived = text(formData, "archived") === "true";
    await setOptionArchived(store.storeId, optionId, archived);
    revalidateOptions(optionId);
    return { ok: true, message: archived ? "보관했습니다. 판매 입력에서 숨겨집니다." : "다시 씁니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addOptionRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireOptionManager();
    const optionId = text(formData, "optionId");
    const kind = text(formData, "kind") as OptionRuleKind;
    if (!["scale", "replace", "add"].includes(kind)) throw new ApiError("규칙 종류를 선택해 주세요.");
    await addOptionRule(store.storeId, optionId, {
      kind,
      itemId: text(formData, "itemId"),
      fromItemId: kind === "replace" ? text(formData, "fromItemId") || null : null,
      quantity: kind === "replace" ? null : number(formData, "quantity"),
      unitId: kind === "add" ? text(formData, "unitId") || null : null,
    });
    revalidateOptions(optionId);
    return { ok: true, message: "규칙을 넣었습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeOptionRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireOptionManager();
    const optionId = text(formData, "optionId");
    await removeOptionRule(store.storeId, optionId, text(formData, "ruleId"));
    revalidateOptions(optionId);
    return { ok: true, message: "규칙을 지웠습니다." };
  } catch (e) {
    return toActionError(e);
  }
}
