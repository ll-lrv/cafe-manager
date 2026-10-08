"use server";

import { can } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import { requireCurrentStore } from "@/lib/api/stores";
import { createSupplier, setSupplierArchived, updateSupplier, type SupplierInput } from "@/lib/api/suppliers";

/** 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB에서는 RLS가 최종 방어) */
async function requireSupplierManager() {
  const store = await requireCurrentStore();
  if (!can(store.role, "supplier:manage")) throw new ApiError("거래처 관리는 사장과 매니저만 할 수 있습니다.");
  return store;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function readInput(formData: FormData): SupplierInput {
  return {
    name: text(formData, "name"),
    contactName: text(formData, "contactName") || null,
    phone: text(formData, "phone") || null,
    email: text(formData, "email") || null,
    memo: text(formData, "memo") || null,
    leadDays: Number(text(formData, "leadDays")),
    coverDays: Number(text(formData, "coverDays")),
  };
}

function revalidateSuppliers(supplierId?: string) {
  revalidatePath("/suppliers");
  revalidatePath("/orders", "layout");
  if (supplierId) revalidatePath(`/suppliers/${supplierId}`);
}

export async function createSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let supplierId: string;
  try {
    const store = await requireSupplierManager();
    supplierId = await createSupplier(store.storeId, readInput(formData));
  } catch (e) {
    return toActionError(e);
  }
  revalidateSuppliers();
  // 발주서 작성 중에 거래처를 만들러 왔으면 돌아간다.
  const next = String(formData.get("next") ?? "");
  redirect(next === "/orders/new" ? `/orders/new?supplier=${supplierId}` : `/suppliers/${supplierId}`);
}

export async function updateSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireSupplierManager();
    const supplierId = text(formData, "supplierId");
    await updateSupplier(store.storeId, supplierId, readInput(formData));
    revalidateSuppliers(supplierId);
    return { ok: true, message: "저장했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setSupplierArchivedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireSupplierManager();
    const supplierId = text(formData, "supplierId");
    const archived = text(formData, "archived") === "true";
    await setSupplierArchived(store.storeId, supplierId, archived);
    revalidateSuppliers(supplierId);
    return { ok: true, message: archived ? "보관했습니다. 새 발주서에서 숨겨집니다." : "다시 거래합니다." };
  } catch (e) {
    return toActionError(e);
  }
}
