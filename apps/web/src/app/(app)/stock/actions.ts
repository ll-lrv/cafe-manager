"use server";

import { can } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import { getLatestCosts } from "@/lib/api/menus";
import { recordMovement, type ManualMovementType } from "@/lib/api/stock";
import { requireCurrentStore } from "@/lib/api/stores";
import { costNoticeAfterReceive } from "@/lib/cost-notice";

const TYPES: ManualMovementType[] = ["receive", "consume", "waste", "adjust"];

const DONE_MESSAGE: Record<ManualMovementType, string> = {
  receive: "입고를 기록했습니다.",
  consume: "사용을 기록했습니다.",
  waste: "폐기를 기록했습니다.",
  adjust: "재고를 조정했습니다.",
};

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** "1,000" 처럼 쉼표가 들어간 숫자도 받는다. 빈 값은 null */
function numberOrNull(formData: FormData, name: string): number | null {
  const raw = text(formData, name).replace(/,/g, "");
  return raw === "" ? null : Number(raw);
}

export async function recordMovementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireCurrentStore();
    const type = text(formData, "type") as ManualMovementType;
    if (!TYPES.includes(type)) throw new ApiError("기록 종류를 선택해 주세요.");
    // 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB 함수가 최종 확인)
    if (!can(store.role, "stock:move")) throw new ApiError("입출고 기록 권한이 없습니다.");
    if (type === "adjust" && !can(store.role, "stock:adjust")) {
      throw new ApiError("재고 조정은 사장과 매니저만 할 수 있습니다.");
    }

    const itemId = text(formData, "itemId");
    if (!itemId) throw new ApiError("품목을 선택해 주세요.");
    const quantity = numberOrNull(formData, "quantity");
    if (quantity === null) throw new ApiError("수량을 입력해 주세요.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError("수량은 0보다 큰 숫자로 입력해 주세요.");
    const memo = text(formData, "memo") || null;
    if (type === "adjust" && !memo) throw new ApiError("조정 사유를 입력해 주세요.");

    const unitPrice = type === "receive" ? numberOrNull(formData, "unitPrice") : null;
    // 단가를 넣은 입고면 단가 변동 알림을 위해 입고 전 단가를 받아 둔다. (원가는 리포트 권한이 있는 사람에게만)
    const watchCost = unitPrice !== null && can(store.role, "report:view");
    const costsBefore = watchCost ? await getLatestCosts(store.storeId, { itemIds: [itemId] }) : {};

    await recordMovement({
      itemId,
      type,
      // 조정은 늘림/줄임을 따로 고르고 수량은 양수로 받는다.
      quantity: type === "adjust" && text(formData, "direction") === "decrease" ? -quantity : quantity,
      unitId: text(formData, "unitId") || null,
      unitPrice,
      expiresOn: type === "receive" || type === "adjust" ? text(formData, "expiresOn") || null : null,
      memo,
    });

    revalidatePath("/stock");
    revalidatePath("/items", "layout");
    const notice = watchCost ? await costNoticeAfterReceive(store, [itemId], costsBefore) : undefined;
    return { ok: true, message: DONE_MESSAGE[type], notice };
  } catch (e) {
    return toActionError(e);
  }
}
