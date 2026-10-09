"use server";

import { can, zonedTimeToUtc, type OptionWordChoice } from "@cafe/core";
import { revalidatePath } from "next/cache";
import { ApiError, toActionError, type ActionState } from "@/lib/api/errors";
import {
  cancelSaleImport,
  createSaleImport,
  IMPORT_CHUNK_SIZE,
  importSaleRows,
  saveMenuAliases,
  saveOptionAliases,
} from "@/lib/api/sale-imports";
import { getLastCountCompletedAt } from "@/lib/api/counts";
import { requireCurrentStore } from "@/lib/api/stores";
import { countedBeforeNotice, isValidDate, storeEndOfDay, storeToday } from "@/lib/inventory";

/** 화면에서 숨겨도 요청은 직접 보낼 수 있으므로 서버에서 한 번 더 확인한다. (DB 함수·RLS가 최종 확인) */
async function requireImporter() {
  const store = await requireCurrentStore();
  if (!can(store.role, "sale:import")) throw new ApiError("판매 가져오기는 사장과 매니저만 할 수 있습니다.");
  return store;
}

function revalidateSales() {
  revalidatePath("/sales", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  revalidatePath("/items", "layout");
  revalidatePath("/reports");
}

/** 화면이 보내는 판매 행. 날짜·시각은 매장 시간대 기준 벽시계 값 */
export interface ImportRowInput {
  menuId: string;
  quantity: number;
  amount: number | null;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM:SS 또는 null (그 날 마감 시각) */
  time: string | null;
  key: string;
  /** 옵션 열에서 옵션으로 고른 낱말의 옵션 */
  optionIds: string[];
}

/**
 * 가져오기를 시작한다: 메뉴 이름·옵션 낱말 매칭을 저장하고 가져오기 기록을 만든다.
 * aliases: 파일의 메뉴 이름 → 메뉴 id (null 이면 가져오지 않음)
 * optionAliases: 옵션 열 낱말 → 옵션 / 메뉴 이름에 붙임 / 무시
 */
export async function startImportAction(
  fileName: string,
  aliases: Record<string, string | null>,
  optionAliases: Record<string, OptionWordChoice> = {},
): Promise<{ error?: string; importId?: string }> {
  try {
    const store = await requireImporter();
    const entries = Object.entries(aliases ?? {});
    if (entries.length > 2000) throw new ApiError("메뉴 이름이 너무 많습니다.");
    if (entries.some(([name, id]) => !name || name.length > 200 || (id !== null && typeof id !== "string"))) {
      throw new ApiError("메뉴 매칭을 확인해 주세요.");
    }
    const words = Object.entries(optionAliases ?? {});
    if (words.length > 2000) throw new ApiError("옵션 낱말이 너무 많습니다.");
    if (
      words.some(
        ([w, c]) =>
          !w ||
          w.length > 100 ||
          !c ||
          !["option", "menu", "ignore"].includes(c.kind) ||
          (c.kind === "option" && typeof c.optionId !== "string"),
      )
    ) {
      throw new ApiError("옵션 매칭을 확인해 주세요.");
    }
    await saveMenuAliases(store.storeId, Object.fromEntries(entries));
    await saveOptionAliases(store.storeId, Object.fromEntries(words));
    return { importId: await createSaleImport(store.storeId, String(fileName ?? "")) };
  } catch (e) {
    return toActionError(e) ?? {};
  }
}

/**
 * 판매 행을 나눠 넣는다 (한 번에 IMPORT_CHUNK_SIZE 건). 반환: 새로 넣은 건수 (이미 가져온 행은 빠짐),
 * 마지막 실사보다 이전 시각의 행 수 (그 실사에서 센 품목의 재고는 바꾸지 않는다, 안내용)
 */
export async function importChunkAction(
  importId: string,
  rows: ImportRowInput[],
): Promise<{ error?: string; inserted?: number; beforeCount?: number; lastCountDay?: string }> {
  try {
    const store = await requireImporter();
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > IMPORT_CHUNK_SIZE) {
      throw new ApiError("가져올 판매를 확인해 주세요.");
    }
    const today = storeToday(store.timeZone);
    const now = new Date().toISOString();
    const converted = rows.map((r) => {
      if (!isValidDate(r.date)) throw new ApiError("판매 날짜를 확인해 주세요.");
      if (r.date > today) throw new ApiError(`미래 날짜의 판매는 가져올 수 없습니다: ${r.date}`);
      if (r.time !== null && !/^\d{2}:\d{2}:\d{2}$/.test(String(r.time))) throw new ApiError("판매 시각을 확인해 주세요.");
      // 시각이 없으면 그 날 마감 시각 (직접 입력의 지난 날짜와 같음). 오늘이면 지금.
      const soldAt = r.time
        ? zonedTimeToUtc(r.date, r.time, store.timeZone).toISOString()
        : r.date === today
          ? now
          : storeEndOfDay(r.date, store.timeZone);
      return {
        menuId: String(r.menuId),
        quantity: Number(r.quantity),
        amount: r.amount === null ? null : Number(r.amount),
        soldAt,
        externalId: String(r.key),
        optionIds: Array.isArray(r.optionIds) ? r.optionIds.map(String) : [],
      };
    });
    const [inserted, lastCountAt] = await Promise.all([
      importSaleRows(String(importId), converted),
      getLastCountCompletedAt(store.storeId),
    ]);
    revalidateSales();
    const beforeCount = lastCountAt ? converted.filter((r) => Date.parse(r.soldAt) < Date.parse(lastCountAt)).length : 0;
    const lastCountDay = lastCountAt
      ? new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: store.timeZone }).format(new Date(lastCountAt))
      : undefined;
    return { inserted, beforeCount, lastCountDay };
  } catch (e) {
    return toActionError(e) ?? {};
  }
}

export async function cancelImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const store = await requireImporter();
    const { firstSoldAt } = await cancelSaleImport(store.storeId, String(formData.get("importId") ?? ""));
    revalidateSales();
    const notice = firstSoldAt
      ? countedBeforeNotice(await getLastCountCompletedAt(store.storeId), firstSoldAt, store.timeZone, "cancel")
      : undefined;
    return { ok: true, message: "가져오기를 취소했습니다. 그때 들어온 판매와 재료 차감을 되돌렸습니다.", notice };
  } catch (e) {
    return toActionError(e);
  }
}
