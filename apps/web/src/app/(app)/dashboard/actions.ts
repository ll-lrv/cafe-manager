"use server";

import { can } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import { requireCurrentStore } from "@/lib/api/stores";
import { applyCafeTemplate } from "@/lib/api/templates";

export async function applyTemplateAction(): Promise<ActionState> {
  try {
    const store = await requireCurrentStore();
    if (!can(store.role, "catalog:manage")) throw new ApiError("품목과 메뉴는 사장과 매니저만 관리할 수 있습니다.");
    const result = await applyCafeTemplate(store.storeId);
    revalidatePath("/", "layout");
    return { ok: true, message: `품목 ${result.items}개, 메뉴 ${result.menus}개를 불러왔습니다.` };
  } catch (e) {
    return toActionError(e);
  }
}
