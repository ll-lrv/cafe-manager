"use server";

import { can } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import { requireCurrentStore, updateStore } from "@/lib/api/stores";

export async function updateStoreAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCurrentStore();
    // 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB에서는 RLS·컬럼 권한이 최종 방어)
    if (!can(store.role, "store:manage")) throw new ApiError("매장 정보는 사장만 바꿀 수 있습니다.");
    await updateStore(store.storeId, {
      name: String(formData.get("name") ?? ""),
      timeZone: String(formData.get("timeZone") ?? ""),
    });
    // 머리글의 매장 이름과 모든 화면의 날짜가 바뀐다.
    revalidatePath("/", "layout");
    return { ok: true, message: "매장 정보를 저장했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}
