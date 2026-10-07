"use server";

import { can } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import { cancelSale, recordSales, type SaleLine } from "@/lib/api/sales";
import { requireCurrentStore } from "@/lib/api/stores";
import { isValidDate, storeEndOfDay, storeToday } from "@/lib/inventory";

function revalidateSales() {
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  revalidatePath("/items", "layout");
}

function readLines(formData: FormData): SaleLine[] {
  try {
    const parsed: unknown = JSON.parse(String(formData.get("lines") ?? "[]"));
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.map((l: { menuId?: unknown; quantity?: unknown }) => ({
      menuId: String(l.menuId ?? ""),
      quantity: Number(l.quantity),
    }));
  } catch {
    throw new ApiError("판매 수량을 확인해 주세요.");
  }
}

export async function recordSalesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCurrentStore();
    // 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB 함수가 최종 확인)
    if (!can(store.role, "sale:record")) throw new ApiError("판매 입력 권한이 없습니다.");

    const date = String(formData.get("date") ?? "");
    const today = storeToday(store.timeZone);
    if (!isValidDate(date) || date > today) throw new ApiError("판매 날짜를 확인해 주세요.");
    // 오늘은 지금 시각, 지난 날짜는 그 날 마감 시각으로 기록한다.
    const soldAt = date === today ? null : storeEndOfDay(date, store.timeZone);

    const lines = readLines(formData);
    await recordSales(lines, soldAt);
    revalidateSales();
    const total = lines.reduce((sum, l) => sum + l.quantity, 0);
    return { ok: true, message: `판매 ${total.toLocaleString("ko-KR")}개를 기록했습니다.` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelSaleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCurrentStore();
    if (!can(store.role, "sale:cancel")) throw new ApiError("판매 취소는 사장과 매니저만 할 수 있습니다.");
    await cancelSale(store.storeId, String(formData.get("saleId") ?? ""));
    revalidateSales();
    return { ok: true, message: "판매를 취소했습니다. 차감된 재료도 되돌렸습니다." };
  } catch (e) {
    return toActionError(e);
  }
}
