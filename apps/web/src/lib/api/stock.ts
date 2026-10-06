import "server-only";
import type { BaseUnit } from "@cafe/core";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";

/** 화면에서 직접 기록할 수 있는 종류. 판매(sale)는 판매 입력에서 기록한다. */
export type ManualMovementType = "receive" | "consume" | "waste" | "adjust";
export type MovementType = ManualMovementType | "sale";

export interface MovementInput {
  itemId: string;
  type: ManualMovementType;
  /** 입력 단위 기준. adjust 만 부호 포함 */
  quantity: number;
  /** null 이면 기본 단위 */
  unitId: string | null;
  /** 입고 단가 (입력 단위 1개당, 원) */
  unitPrice: number | null;
  /** YYYY-MM-DD. 유통기한 품목 입고에 필요 */
  expiresOn: string | null;
  memo: string | null;
}

export interface Movement {
  id: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  type: MovementType;
  /** 기본 단위, 부호 포함 */
  quantity: number;
  enteredQuantity: number | null;
  enteredUnitName: string | null;
  /** 기본 단위 1개당 원가 (입고만) */
  unitCost: number | null;
  expiresOn: string | null;
  memo: string | null;
  createdByName: string | null;
  occurredAt: string;
}

/**
 * 입출고를 기록한다. 로트 생성·유통기한 순 차감·원장 기록은 DB 함수 record_stock_movement 가
 * 한 트랜잭션으로 처리한다. (docs/db-functions.md)
 */
export async function recordMovement(input: MovementInput): Promise<number> {
  if (!Number.isFinite(input.quantity) || input.quantity === 0) throw new ApiError("수량을 확인해 주세요.");
  if (input.type !== "adjust" && input.quantity < 0) throw new ApiError("수량을 확인해 주세요.");
  if (input.unitPrice !== null && (!Number.isInteger(input.unitPrice) || input.unitPrice < 0)) {
    throw new ApiError("단가는 0 이상의 원 단위 숫자로 입력해 주세요.");
  }
  if (input.expiresOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn)) {
    throw new ApiError("유통기한 날짜를 확인해 주세요.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_stock_movement", {
    p_item_id: input.itemId,
    p_type: input.type,
    p_quantity: input.quantity,
    p_unit_id: input.unitId ?? undefined,
    p_unit_price: input.unitPrice ?? undefined,
    p_expires_on: input.expiresOn ?? undefined,
    p_memo: input.memo ?? undefined,
  });
  // 잘못된 형식의 ID(uuid 아님)
  if (error?.code === "22P02") throw new ApiError("품목을 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data;
}

type MovementRow = {
  id: string;
  item_id: string;
  type: MovementType;
  quantity: number;
  entered_quantity: number | null;
  unit_cost: number | null;
  memo: string | null;
  occurred_at: string;
  item: { name: string; base_unit: BaseUnit } | null;
  unit: { name: string } | null;
  lot: { expires_on: string | null } | null;
  creator: { display_name: string } | null;
};

/** 최근 입출고 기록. itemId 를 주면 그 품목만 */
export async function listMovements(
  storeId: string,
  { itemId, limit = 50 }: { itemId?: string; limit?: number } = {},
): Promise<Movement[]> {
  const supabase = await createClient();
  let query = supabase
    .from("stock_movements")
    .select(
      "id, item_id, type, quantity, entered_quantity, unit_cost, memo, occurred_at, item:items(name, base_unit), unit:item_units(name), lot:stock_lots(expires_on), creator:profiles(display_name)",
    )
    .eq("store_id", storeId)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (itemId) query = query.eq("item_id", itemId);

  const { data, error } = await query;
  if (error?.code === "22P02") return [];
  if (error) throw new ApiError(dbErrorMessage(error));

  return (data as MovementRow[]).map((m) => ({
    id: m.id,
    itemId: m.item_id,
    itemName: m.item?.name ?? "알 수 없는 품목",
    baseUnit: m.item?.base_unit ?? "ea",
    type: m.type,
    quantity: m.quantity,
    enteredQuantity: m.entered_quantity,
    enteredUnitName: m.unit?.name ?? null,
    unitCost: m.unit_cost,
    expiresOn: m.lot?.expires_on ?? null,
    memo: m.memo,
    createdByName: m.creator?.display_name ?? null,
    occurredAt: m.occurred_at,
  }));
}

/** 품목별 현재 재고 (기본 단위). 보관된 품목은 빠진다. */
export async function getStockLevels(storeId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_stock_levels")
    .select("item_id, quantity")
    .eq("store_id", storeId);
  if (error) throw new ApiError(dbErrorMessage(error));
  return Object.fromEntries(data.flatMap((r) => (r.item_id ? [[r.item_id, r.quantity ?? 0]] : [])));
}

export interface LotLevel {
  lotId: string;
  itemId: string;
  /** YYYY-MM-DD */
  expiresOn: string | null;
  /** 남은 수량 (기본 단위, 양수) */
  quantity: number;
}

/** 남은 양이 있는 유통기한 로트. 기한이 빠른 순 (기한 없음은 맨 뒤) */
export async function listLotLevels(storeId: string, { itemId }: { itemId?: string } = {}): Promise<LotLevel[]> {
  const supabase = await createClient();
  let query = supabase
    .from("lot_stock_levels")
    .select("lot_id, item_id, expires_on, quantity")
    .eq("store_id", storeId)
    .order("expires_on", { ascending: true, nullsFirst: false });
  if (itemId) query = query.eq("item_id", itemId);
  const { data, error } = await query;
  if (error) throw new ApiError(dbErrorMessage(error));
  return data.flatMap((l) =>
    l.lot_id && l.item_id
      ? [{ lotId: l.lot_id, itemId: l.item_id, expiresOn: l.expires_on, quantity: l.quantity ?? 0 }]
      : [],
  );
}
