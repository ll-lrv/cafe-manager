"use server";

import { can, type BaseUnit } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addItemUnit,
  createCategory,
  createItem,
  deleteCategory,
  deleteItemUnit,
  moveCategory,
  renameCategory,
  setDefaultPurchaseUnit,
  setItemArchived,
  updateItem,
  type ItemInput,
} from "@/lib/api/catalog";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import { requireCurrentStore } from "@/lib/api/stores";

/** 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB에서는 RLS가 최종 방어) */
async function requireCatalogManager() {
  const store = await requireCurrentStore();
  if (!can(store.role, "catalog:manage")) throw new ApiError("품목 관리는 사장과 매니저만 할 수 있습니다.");
  return store;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

/** "1,000" 처럼 쉼표가 들어간 숫자도 받는다. 빈 값은 fallback */
function number(formData: FormData, name: string, fallback?: number): number {
  const raw = text(formData, name).replace(/,/g, "").trim();
  if (raw === "" && fallback !== undefined) return fallback;
  return raw === "" ? NaN : Number(raw);
}

function readItemInput(formData: FormData): ItemInput {
  return {
    name: text(formData, "name"),
    categoryId: text(formData, "categoryId") || null,
    defaultSupplierId: text(formData, "defaultSupplierId") || null,
    baseUnit: text(formData, "baseUnit") as BaseUnit,
    minStock: number(formData, "minStock", 0),
    trackExpiry: formData.get("trackExpiry") === "on",
    barcode: text(formData, "barcode"),
    memo: text(formData, "memo"),
  };
}

function revalidateItems(itemId?: string) {
  revalidatePath("/items");
  if (itemId) revalidatePath(`/items/${itemId}`);
}

// ---------------------------------------------------------------- 품목

export async function createItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let itemId: string;
  try {
    const store = await requireCatalogManager();
    itemId = await createItem(store.storeId, readItemInput(formData));
  } catch (e) {
    return toActionError(e);
  }
  revalidateItems();
  redirect(`/items/${itemId}?created=1`);
}

export async function updateItemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCatalogManager();
    const itemId = text(formData, "itemId");
    await updateItem(store.storeId, itemId, readItemInput(formData));
    revalidateItems(itemId);
    return { ok: true, message: "저장했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setItemArchivedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCatalogManager();
    const itemId = text(formData, "itemId");
    const archived = text(formData, "archived") === "true";
    await setItemArchived(store.storeId, itemId, archived);
    revalidateItems(itemId);
    return { ok: true, message: archived ? "보관했습니다. 목록과 입출고 화면에서 숨겨집니다." : "다시 사용합니다." };
  } catch (e) {
    return toActionError(e);
  }
}

// ---------------------------------------------------------------- 입고 단위

export async function addItemUnitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCatalogManager();
    const itemId = text(formData, "itemId");
    await addItemUnit(store.storeId, itemId, {
      name: text(formData, "name"),
      factor: number(formData, "factor"),
      isDefaultPurchase: formData.get("isDefaultPurchase") === "on",
    });
    revalidateItems(itemId);
    return { ok: true, message: "단위를 추가했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setDefaultUnitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCatalogManager();
    const itemId = text(formData, "itemId");
    await setDefaultPurchaseUnit(store.storeId, itemId, text(formData, "unitId"));
    revalidateItems(itemId);
    return { ok: true, message: "기본 입고 단위로 정했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteItemUnitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCatalogManager();
    const itemId = text(formData, "itemId");
    await deleteItemUnit(store.storeId, itemId, text(formData, "unitId"));
    revalidateItems(itemId);
    return { ok: true, message: "단위를 삭제했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

// ---------------------------------------------------------------- 카테고리

export async function createCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCatalogManager();
    await createCategory(store.storeId, text(formData, "name"));
    revalidatePath("/items", "layout");
    return { ok: true, message: "카테고리를 추가했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function renameCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCatalogManager();
    await renameCategory(store.storeId, text(formData, "categoryId"), text(formData, "name"));
    revalidatePath("/items", "layout");
    return { ok: true, message: "이름을 바꿨습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function moveCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCatalogManager();
    const direction = text(formData, "direction") === "up" ? "up" : "down";
    await moveCategory(store.storeId, text(formData, "categoryId"), direction);
    revalidatePath("/items", "layout");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCatalogManager();
    await deleteCategory(store.storeId, text(formData, "categoryId"));
    revalidatePath("/items", "layout");
    return { ok: true, message: "카테고리를 삭제했습니다. 속해 있던 품목은 미분류가 됩니다." };
  } catch (e) {
    return toActionError(e);
  }
}
