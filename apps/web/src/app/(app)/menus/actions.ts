"use server";

import { can } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import {
  createMenu,
  removeRecipeIngredient,
  setMenuArchived,
  setRecipeIngredient,
  updateMenu,
  type MenuInput,
} from "@/lib/api/menus";
import { requireCurrentStore } from "@/lib/api/stores";

/** 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB에서는 RLS가 최종 방어) */
async function requireMenuManager() {
  const store = await requireCurrentStore();
  if (!can(store.role, "catalog:manage")) throw new ApiError("메뉴 관리는 사장과 매니저만 할 수 있습니다.");
  return store;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** "4,500" 처럼 쉼표가 들어간 숫자도 받는다. */
function number(formData: FormData, name: string): number {
  const raw = text(formData, name).replace(/,/g, "");
  return raw === "" ? NaN : Number(raw);
}

function readMenuInput(formData: FormData): MenuInput {
  const target = text(formData, "targetCostRate");
  return {
    name: text(formData, "name"),
    price: number(formData, "price"),
    // 비우면 매장 기본값
    targetCostRate: target === "" ? null : number(formData, "targetCostRate"),
  };
}

function revalidateMenus(menuId?: string) {
  revalidatePath("/menus");
  revalidatePath("/sales");
  revalidatePath("/reports/menus");
  revalidatePath("/dashboard");
  if (menuId) revalidatePath(`/menus/${menuId}`);
}

export async function createMenuAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let menuId: string;
  try {
    const store = await requireMenuManager();
    menuId = await createMenu(store.storeId, readMenuInput(formData));
  } catch (e) {
    return toActionError(e);
  }
  revalidateMenus();
  redirect(`/menus/${menuId}?created=1`);
}

export async function updateMenuAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireMenuManager();
    const menuId = text(formData, "menuId");
    await updateMenu(store.storeId, menuId, readMenuInput(formData));
    revalidateMenus(menuId);
    return { ok: true, message: "저장했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setMenuArchivedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireMenuManager();
    const menuId = text(formData, "menuId");
    const archived = text(formData, "archived") === "true";
    await setMenuArchived(store.storeId, menuId, archived);
    revalidateMenus(menuId);
    return { ok: true, message: archived ? "보관했습니다. 판매 입력에서 숨겨집니다." : "다시 판매합니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setIngredientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireMenuManager();
    const menuId = text(formData, "menuId");
    await setRecipeIngredient(store.storeId, menuId, {
      itemId: text(formData, "itemId"),
      quantity: number(formData, "quantity"),
      unitId: text(formData, "unitId") || null,
    });
    revalidateMenus(menuId);
    return { ok: true, message: "레시피를 저장했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeIngredientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireMenuManager();
    const menuId = text(formData, "menuId");
    await removeRecipeIngredient(store.storeId, menuId, text(formData, "itemId"));
    revalidateMenus(menuId);
    return { ok: true, message: "재료를 뺐습니다." };
  } catch (e) {
    return toActionError(e);
  }
}
