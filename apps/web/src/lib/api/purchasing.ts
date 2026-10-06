import "server-only";
import type { BaseUnit, PurchaseOrderStatus } from "@cafe/core";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";
import { requireUser } from "./session";

export interface OrderLine {
  id: string;
  itemId: string;
  itemName: string;
  baseUnit: BaseUnit;
  trackExpiry: boolean;
  itemArchived: boolean;
  /** null 이면 기본 단위로 주문 */
  unitId: string | null;
  unitName: string | null;
  /** 주문 단위 1개 = 기본 단위 factor (기본 단위면 1) */
  factor: number;
  /** 주문 단위 기준 수량 */
  quantity: number;
  /** 주문 단위 1개당 원 */
  unitPrice: number | null;
  receivedQuantity: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierPhone: string | null;
  status: PurchaseOrderStatus;
  orderedAt: string | null;
  /** YYYY-MM-DD */
  expectedOn: string | null;
  memo: string | null;
  createdAt: string;
  createdByName: string | null;
  lines: OrderLine[];
}

export interface OrderLineInput {
  itemId: string;
  unitId: string | null;
  quantity: number;
  unitPrice: number | null;
}

export interface ReceiveLineInput {
  lineId: string;
  /** 이번에 들어온 수량 (주문 단위) */
  quantity: number;
  unitPrice: number | null;
  expiresOn: string | null;
}

const ORDER_SELECT =
  "id, supplier_id, status, ordered_at, expected_on, memo, created_at, supplier:suppliers(name, phone), creator:profiles(display_name), lines:purchase_order_lines(id, item_id, item_unit_id, quantity, unit_price, received_quantity, item:items(name, base_unit, track_expiry, archived_at), unit:item_units(name, factor))";

type OrderRow = {
  id: string;
  supplier_id: string;
  status: PurchaseOrderStatus;
  ordered_at: string | null;
  expected_on: string | null;
  memo: string | null;
  created_at: string;
  supplier: { name: string; phone: string | null } | null;
  creator: { display_name: string } | null;
  lines: {
    id: string;
    item_id: string;
    item_unit_id: string | null;
    quantity: number;
    unit_price: number | null;
    received_quantity: number;
    item: { name: string; base_unit: BaseUnit; track_expiry: boolean; archived_at: string | null } | null;
    unit: { name: string; factor: number } | null;
  }[];
};

function toOrder(row: OrderRow): PurchaseOrder {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.supplier?.name ?? "알 수 없는 거래처",
    supplierPhone: row.supplier?.phone ?? null,
    status: row.status,
    orderedAt: row.ordered_at,
    expectedOn: row.expected_on,
    memo: row.memo,
    createdAt: row.created_at,
    createdByName: row.creator?.display_name ?? null,
    lines: row.lines
      .map((l) => ({
        id: l.id,
        itemId: l.item_id,
        itemName: l.item?.name ?? "알 수 없는 품목",
        baseUnit: l.item?.base_unit ?? "ea",
        trackExpiry: l.item?.track_expiry ?? false,
        itemArchived: !!l.item?.archived_at,
        unitId: l.item_unit_id,
        unitName: l.unit?.name ?? null,
        factor: l.unit?.factor ?? 1,
        quantity: l.quantity,
        unitPrice: l.unit_price,
        receivedQuantity: l.received_quantity,
      }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName, "ko")),
  };
}

function lineErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("purchase_order_lines_po_item_key")) {
    return "이미 담긴 품목입니다. 수량을 바꿔 주세요.";
  }
  if (error.code === "42501") return "작성 중인 발주서만 고칠 수 있습니다.";
  return dbErrorMessage(error);
}

function validateLine(line: Omit<OrderLineInput, "itemId">) {
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new ApiError("수량은 0보다 큰 숫자로 입력해 주세요.");
  if (line.unitPrice !== null && (!Number.isInteger(line.unitPrice) || line.unitPrice < 0)) {
    throw new ApiError("단가는 0 이상의 원 단위 숫자로 입력해 주세요.");
  }
  return { item_unit_id: line.unitId, quantity: Math.round(line.quantity * 1000) / 1000, unit_price: line.unitPrice };
}

function validateExpectedOn(value: string | null) {
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError("입고 예정일을 확인해 주세요.");
  return value || null;
}

// ---------------------------------------------------------------- 조회

/** 매장의 발주서 (최근 것부터) */
export async function listPurchaseOrders(
  storeId: string,
  { statuses, limit = 100 }: { statuses?: PurchaseOrderStatus[]; limit?: number } = {},
): Promise<PurchaseOrder[]> {
  const supabase = await createClient();
  let query = supabase
    .from("purchase_orders")
    .select(ORDER_SELECT)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (statuses) query = query.in("status", statuses);
  const { data, error } = await query;
  if (error) throw new ApiError(dbErrorMessage(error));
  return (data as OrderRow[]).map(toOrder);
}

export async function getPurchaseOrder(storeId: string, orderId: string): Promise<PurchaseOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(ORDER_SELECT)
    .eq("store_id", storeId)
    .eq("id", orderId)
    .maybeSingle();
  if (error?.code === "22P02") return null;
  if (error) throw new ApiError(dbErrorMessage(error));
  return data ? toOrder(data as OrderRow) : null;
}

// ---------------------------------------------------------------- 작성

/** 작성 중인 발주서를 만든다. */
export async function createPurchaseOrder(
  storeId: string,
  input: { supplierId: string; expectedOn: string | null; memo: string | null },
): Promise<string> {
  if (!input.supplierId) throw new ApiError("거래처를 선택해 주세요.");
  const memo = input.memo?.trim() || null;
  if (memo && memo.length > 500) throw new ApiError("메모는 500자 이하로 입력해 주세요.");
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      store_id: storeId,
      supplier_id: input.supplierId,
      expected_on: validateExpectedOn(input.expectedOn),
      memo,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error?.code === "22P02" || error?.code === "42501") throw new ApiError("거래처를 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data.id;
}

/** 입고 예정일·메모 수정 (작성 중·발주 상태에서) */
export async function updatePurchaseOrder(
  storeId: string,
  orderId: string,
  input: { expectedOn: string | null; memo: string | null },
) {
  const memo = input.memo?.trim() || null;
  if (memo && memo.length > 500) throw new ApiError("메모는 500자 이하로 입력해 주세요.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .update({ expected_on: validateExpectedOn(input.expectedOn), memo })
    .eq("store_id", storeId)
    .eq("id", orderId)
    .select("id");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 고칠 수 없는 발주서입니다.");
}

/** 작성 중인 발주서에 품목을 담는다. 여러 줄은 한 번의 INSERT 로 넣어 전부 들어가거나 전부 실패한다. */
export async function addOrderLines(orderId: string, lines: OrderLineInput[]) {
  if (lines.length === 0) throw new ApiError("담을 품목이 없습니다.");
  const rows = lines.map((l) => {
    if (!l.itemId) throw new ApiError("품목을 선택해 주세요.");
    return { purchase_order_id: orderId, item_id: l.itemId, ...validateLine(l) };
  });
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_order_lines").insert(rows);
  if (error) throw new ApiError(lineErrorMessage(error));
}

export async function updateOrderLine(orderId: string, lineId: string, input: Omit<OrderLineInput, "itemId">) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_order_lines")
    .update(validateLine(input))
    .eq("purchase_order_id", orderId)
    .eq("id", lineId)
    .select("id");
  if (error) throw new ApiError(lineErrorMessage(error));
  if (data.length === 0) throw new ApiError("작성 중인 발주서만 고칠 수 있습니다.");
}

export async function removeOrderLine(orderId: string, lineId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("purchase_order_id", orderId)
    .eq("id", lineId)
    .select("id");
  if (error) throw new ApiError(lineErrorMessage(error));
  if (data.length === 0) throw new ApiError("작성 중인 발주서만 고칠 수 있습니다.");
}

// ---------------------------------------------------------------- 상태·입고

/**
 * 발주·되돌리기·취소·마감. 허용되는 전환은 DB 함수 change_purchase_order_status 가 정한다.
 * (docs/db-functions.md)
 */
export async function changeOrderStatus(orderId: string, status: PurchaseOrderStatus): Promise<PurchaseOrderStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_purchase_order_status", { p_order_id: orderId, p_status: status });
  if (error?.code === "22P02") throw new ApiError("발주서를 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data;
}

/**
 * 입고 처리. 로트·입고 원장·발주 줄 입고 수량·상태는 DB 함수 receive_purchase_order 가
 * 한 트랜잭션으로 처리한다. 반환: 바뀐 상태
 */
export async function receiveOrder(orderId: string, lines: ReceiveLineInput[]): Promise<PurchaseOrderStatus> {
  const valid = lines.filter((l) => l.quantity !== 0);
  if (valid.length === 0) throw new ApiError("입고 수량을 입력해 주세요.");
  for (const l of valid) {
    if (!Number.isFinite(l.quantity) || l.quantity < 0) throw new ApiError("입고 수량은 0 이상의 숫자로 입력해 주세요.");
    if (l.unitPrice !== null && (!Number.isInteger(l.unitPrice) || l.unitPrice < 0)) {
      throw new ApiError("단가는 0 이상의 원 단위 숫자로 입력해 주세요.");
    }
    if (l.expiresOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(l.expiresOn)) throw new ApiError("유통기한 날짜를 확인해 주세요.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_purchase_order", {
    p_order_id: orderId,
    p_lines: valid.map((l) => ({
      line_id: l.lineId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      expires_on: l.expiresOn,
    })),
  });
  if (error?.code === "22P02") throw new ApiError("발주서를 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data;
}
