"use server";

import { can } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cancelStockCount,
  completeStockCount,
  setCountedQuantity,
  startStockCount,
} from "@/lib/api/counts";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import { requireCurrentStore } from "@/lib/api/stores";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** "1,000" 처럼 쉼표가 들어간 숫자도 받는다. 빈 값은 0 */
function number(formData: FormData, name: string): number {
  const raw = text(formData, name).replace(/,/g, "");
  return raw === "" ? 0 : Number(raw);
}

/** 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB 함수·RLS가 최종 확인) */
async function requireCounter() {
  const store = await requireCurrentStore();
  if (!can(store.role, "stock:count")) throw new ApiError("실사 권한이 없습니다.");
  return store;
}

async function requireCountManager() {
  const store = await requireCurrentStore();
  if (!can(store.role, "stock:count:complete")) throw new ApiError("실사 완료·취소는 사장과 매니저만 할 수 있습니다.");
  return store;
}

function revalidateCount(countId: string) {
  revalidatePath("/counts");
  revalidatePath(`/counts/${countId}`);
}

export async function startCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let countId: string;
  try {
    const store = await requireCounter();
    countId = await startStockCount(store.storeId, text(formData, "categoryId") || null, text(formData, "memo") || null);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/counts");
  revalidatePath("/dashboard");
  redirect(`/counts/${countId}`);
}

/** 센 수량 저장. 묶음 단위(봉·박스) 수 × 환산값 + 낱개(기본 단위)로 받는다. */
export async function saveCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireCounter();
    const countId = text(formData, "countId");
    const packs = number(formData, "packs");
    const loose = number(formData, "loose");
    const factor = number(formData, "factor") || 1;
    if ([packs, loose].some((n) => !Number.isFinite(n) || n < 0)) {
      throw new ApiError("수량은 0 이상의 숫자로 입력해 주세요.");
    }
    await setCountedQuantity(countId, text(formData, "itemId"), packs * factor + loose);
    revalidateCount(countId);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function clearCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireCounter();
    const countId = text(formData, "countId");
    await setCountedQuantity(countId, text(formData, "itemId"), null);
    revalidateCount(countId);
    return { ok: true, message: "센 수량을 지웠습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function completeCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireCountManager();
    const countId = text(formData, "countId");
    const adjusted = await completeStockCount(countId);
    revalidateCount(countId);
    revalidatePath("/dashboard");
    revalidatePath("/stock");
    revalidatePath("/items", "layout");
    return {
      ok: true,
      message: adjusted > 0 ? `실사를 완료했습니다. ${adjusted}개 품목의 재고를 맞췄습니다.` : "실사를 완료했습니다. 장부와 모두 같습니다.",
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelCountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCountManager();
    const countId = text(formData, "countId");
    await cancelStockCount(store.storeId, countId);
    revalidateCount(countId);
    revalidatePath("/dashboard");
    return { ok: true, message: "실사를 취소했습니다. 재고는 바뀌지 않았습니다." };
  } catch (e) {
    return toActionError(e);
  }
}
