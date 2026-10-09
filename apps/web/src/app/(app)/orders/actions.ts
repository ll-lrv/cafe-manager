"use server";

import { can, type PurchaseOrderStatus } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listItems } from "@/lib/api/catalog";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import { getLatestCosts } from "@/lib/api/menus";
import {
  addOrderLines,
  changeOrderStatus,
  createPurchaseOrder,
  getPurchaseOrder,
  receiveOrder,
  removeOrderLine,
  updateOrderLine,
  updatePurchaseOrder,
  type ReceiveLineInput,
} from "@/lib/api/purchasing";
import { getStockLevels } from "@/lib/api/stock";
import { requireCurrentStore } from "@/lib/api/stores";
import { getSupplier } from "@/lib/api/suppliers";
import { costNoticeAfterReceive } from "@/lib/cost-notice";
import { loadDailyUsage, loadIncoming } from "@/lib/item-usage";
import { buildOrderSuggestions } from "@/lib/order-suggestions";

/** 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB 함수·RLS가 최종 확인) */
async function requirePurchaser() {
  const store = await requireCurrentStore();
  if (!can(store.role, "purchase:manage")) throw new ApiError("발주는 사장과 매니저만 할 수 있습니다.");
  return store;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/** "1,000" 처럼 쉼표가 들어간 숫자도 받는다. 빈 값은 null */
function numberOrNull(formData: FormData, name: string): number | null {
  const raw = text(formData, name).replace(/,/g, "");
  return raw === "" ? null : Number(raw);
}

function revalidateOrder(orderId?: string) {
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

/** 거래처의 추천 품목을 추천 수량으로 담는다. 이미 담긴 품목은 건너뛴다. 반환: 담은 개수 */
async function addSuggestedLines(
  store: { storeId: string; timeZone: string },
  orderId: string,
  supplierId: string,
  existing: string[],
) {
  const [items, stock, costs, usage, incoming, supplier] = await Promise.all([
    listItems(store.storeId),
    getStockLevels(store.storeId),
    getLatestCosts(store.storeId),
    loadDailyUsage(store.storeId, store.timeZone),
    loadIncoming(store.storeId),
    getSupplier(store.storeId, supplierId),
  ]);
  if (!supplier) throw new ApiError("없는 거래처입니다.");
  const suggestions = buildOrderSuggestions(items, stock, costs, usage, supplier, incoming, existing);
  if (suggestions.length > 0) await addOrderLines(orderId, suggestions);
  return suggestions.length;
}

export async function createOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let orderId: string;
  try {
    const store = await requirePurchaser();
    const supplierId = text(formData, "supplierId");
    orderId = await createPurchaseOrder(store.storeId, {
      supplierId,
      expectedOn: text(formData, "expectedOn") || null,
      memo: text(formData, "memo") || null,
    });
    if (formData.get("addSuggested") === "on") await addSuggestedLines(store, orderId, supplierId, []);
  } catch (e) {
    return toActionError(e);
  }
  revalidateOrder();
  redirect(`/orders/${orderId}`);
}

export async function updateOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requirePurchaser();
    const orderId = text(formData, "orderId");
    await updatePurchaseOrder(store.storeId, orderId, {
      expectedOn: text(formData, "expectedOn") || null,
      memo: text(formData, "memo") || null,
    });
    revalidateOrder(orderId);
    return { ok: true, message: "저장했습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addLineAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requirePurchaser();
    const orderId = text(formData, "orderId");
    await addOrderLines(orderId, [
      {
        itemId: text(formData, "itemId"),
        unitId: text(formData, "unitId") || null,
        quantity: numberOrNull(formData, "quantity") ?? NaN,
        unitPrice: numberOrNull(formData, "unitPrice"),
      },
    ]);
    revalidateOrder(orderId);
    return { ok: true, message: "품목을 담았습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addSuggestedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requirePurchaser();
    const order = await getPurchaseOrder(store.storeId, text(formData, "orderId"));
    if (!order) throw new ApiError("발주서를 찾을 수 없습니다.");
    const added = await addSuggestedLines(
      store,
      order.id,
      order.supplierId,
      order.lines.map((l) => l.itemId),
    );
    revalidateOrder(order.id);
    return added > 0
      ? { ok: true, message: `추천 품목 ${added}개를 담았습니다.` }
      : { ok: true, message: "더 담을 추천 품목이 없습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateLineAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requirePurchaser();
    const orderId = text(formData, "orderId");
    await updateOrderLine(orderId, text(formData, "lineId"), {
      unitId: text(formData, "unitId") || null,
      quantity: numberOrNull(formData, "quantity") ?? NaN,
      unitPrice: numberOrNull(formData, "unitPrice"),
    });
    revalidateOrder(orderId);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeLineAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requirePurchaser();
    const orderId = text(formData, "orderId");
    await removeOrderLine(orderId, text(formData, "lineId"));
    revalidateOrder(orderId);
    return { ok: true, message: "품목을 뺐습니다." };
  } catch (e) {
    return toActionError(e);
  }
}

const STATUS_MESSAGE: Partial<Record<PurchaseOrderStatus, string>> = {
  ordered: "발주했습니다. 물건이 오면 입고 처리해 주세요.",
  draft: "작성 중으로 되돌렸습니다.",
  cancelled: "발주서를 취소했습니다.",
  received: "남은 수량 없이 마감했습니다.",
};

export async function changeStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requirePurchaser();
    const orderId = text(formData, "orderId");
    const status = text(formData, "status") as PurchaseOrderStatus;
    if (!(status in STATUS_MESSAGE)) throw new ApiError("할 수 없는 작업입니다.");
    await changeOrderStatus(orderId, status);
    revalidateOrder(orderId);
    return { ok: true, message: STATUS_MESSAGE[status] };
  } catch (e) {
    return toActionError(e);
  }
}

export async function receiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requirePurchaser();
    const orderId = text(formData, "orderId");
    let lines: ReceiveLineInput[];
    try {
      const parsed: unknown = JSON.parse(text(formData, "lines") || "[]");
      if (!Array.isArray(parsed)) throw new Error();
      lines = parsed.map((l: Record<string, unknown>) => ({
        lineId: String(l.lineId ?? ""),
        quantity: Number(l.quantity),
        unitPrice: l.unitPrice === null || l.unitPrice === "" || l.unitPrice === undefined ? null : Number(l.unitPrice),
        expiresOn: typeof l.expiresOn === "string" && l.expiresOn ? l.expiresOn : null,
      }));
    } catch {
      throw new ApiError("입고 수량을 확인해 주세요.");
    }
    // 단가 변동 알림을 위해 이번에 들어온 품목의 입고 전 단가를 받아 둔다.
    const order = await getPurchaseOrder(store.storeId, orderId);
    const receivedLineIds = new Set(lines.filter((l) => l.quantity > 0).map((l) => l.lineId));
    const itemIds = (order?.lines ?? []).filter((l) => receivedLineIds.has(l.id)).map((l) => l.itemId);
    const costsBefore = itemIds.length > 0 ? await getLatestCosts(store.storeId, { itemIds }) : {};

    const status = await receiveOrder(orderId, lines);
    revalidateOrder(orderId);
    revalidatePath("/stock");
    revalidatePath("/items", "layout");
    return {
      ok: true,
      message: status === "received" ? "입고를 마쳤습니다. 재고에 반영했습니다." : "일부 입고를 기록했습니다. 남은 수량은 나중에 입고하세요.",
      notice: itemIds.length > 0 ? await costNoticeAfterReceive(store, itemIds, costsBefore) : undefined,
    };
  } catch (e) {
    return toActionError(e);
  }
}
