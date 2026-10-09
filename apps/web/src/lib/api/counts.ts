import "server-only";
import type { BaseUnit } from "@cafe/core";
import { createClient } from "@/lib/supabase/server";
import type { ItemUnitInfo } from "./catalog";
import { ApiError, dbErrorMessage } from "./errors";

export type StockCountStatus = "in_progress" | "completed" | "cancelled";

export interface StockCountSummary {
  id: string;
  status: StockCountStatus;
  /** 이 카테고리만 셌다. null 이면 전체 */
  categoryName: string | null;
  memo: string | null;
  startedAt: string;
  completedAt: string | null;
  createdByName: string | null;
  completedByName: string | null;
  lineCount: number;
  countedCount: number;
  /** 완료할 때 조정된 품목 수 */
  adjustedCount: number;
}

export interface StockCountLine {
  itemId: string;
  itemName: string;
  categoryName: string | null;
  baseUnit: BaseUnit;
  units: ItemUnitInfo[];
  /** 실사 시작 시점의 장부 재고 */
  expectedQuantity: number;
  countedQuantity: number | null;
  countedAt: string | null;
  countedByName: string | null;
  /** 센 시각의 장부 재고. 세지 않았으면 null */
  bookAtCount: number | null;
  /** 완료할 때 적용된 조정량 */
  adjustment: number | null;
}

const SUMMARY_SELECT =
  "id, status, memo, started_at, completed_at, category:categories(name), creator:profiles!stock_counts_created_by_profiles_id_fk(display_name), completer:profiles!stock_counts_completed_by_profiles_id_fk(display_name), lines:stock_count_lines(counted_quantity, adjustment)";

type SummaryRow = {
  id: string;
  status: StockCountStatus;
  memo: string | null;
  started_at: string;
  completed_at: string | null;
  category: { name: string } | null;
  creator: { display_name: string } | null;
  completer: { display_name: string } | null;
  lines: { counted_quantity: number | null; adjustment: number | null }[];
};

function toSummary(row: SummaryRow): StockCountSummary {
  return {
    id: row.id,
    status: row.status,
    categoryName: row.category?.name ?? null,
    memo: row.memo,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdByName: row.creator?.display_name ?? null,
    completedByName: row.completer?.display_name ?? null,
    lineCount: row.lines.length,
    countedCount: row.lines.filter((l) => l.counted_quantity !== null).length,
    adjustedCount: row.lines.filter((l) => l.adjustment !== null && l.adjustment !== 0).length,
  };
}

/** 최근 실사 목록. 진행 중인 실사가 있으면 맨 위 */
export async function listStockCounts(storeId: string, limit = 30): Promise<StockCountSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_counts")
    .select(SUMMARY_SELECT)
    .eq("store_id", storeId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new ApiError(dbErrorMessage(error));
  const counts = (data as SummaryRow[]).map(toSummary);
  return [...counts.filter((c) => c.status === "in_progress"), ...counts.filter((c) => c.status !== "in_progress")];
}

type LineRow = {
  item_id: string;
  expected_quantity: number;
  counted_quantity: number | null;
  counted_at: string | null;
  adjustment: number | null;
  item: {
    name: string;
    base_unit: BaseUnit;
    category: { name: string } | null;
    units: { id: string; name: string; factor: number; is_default_purchase: boolean }[];
  } | null;
  counter: { display_name: string } | null;
};

export async function getStockCount(
  storeId: string,
  countId: string,
): Promise<{ count: StockCountSummary; lines: StockCountLine[] } | null> {
  const supabase = await createClient();
  const [countResult, linesResult, booksResult] = await Promise.all([
    supabase.from("stock_counts").select(SUMMARY_SELECT).eq("store_id", storeId).eq("id", countId).maybeSingle(),
    supabase
      .from("stock_count_lines")
      .select(
        "item_id, expected_quantity, counted_quantity, counted_at, adjustment, item:items(name, base_unit, category:categories(name), units:item_units(id, name, factor, is_default_purchase)), counter:profiles(display_name)",
      )
      .eq("stock_count_id", countId),
    supabase.from("stock_count_line_books").select("item_id, book_quantity").eq("stock_count_id", countId),
  ]);
  // 잘못된 형식의 ID(uuid 아님)는 없는 실사로 본다.
  if (countResult.error?.code === "22P02") return null;
  for (const r of [countResult, linesResult, booksResult]) {
    if (r.error) throw new ApiError(dbErrorMessage(r.error));
  }
  if (!countResult.data) return null;

  const books = new Map((booksResult.data ?? []).map((b) => [b.item_id, b.book_quantity]));
  const lines = (linesResult.data as LineRow[])
    .map((l) => ({
      itemId: l.item_id,
      itemName: l.item?.name ?? "알 수 없는 품목",
      categoryName: l.item?.category?.name ?? null,
      baseUnit: l.item?.base_unit ?? "ea",
      units: (l.item?.units ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        factor: u.factor,
        isDefaultPurchase: u.is_default_purchase,
      })),
      expectedQuantity: l.expected_quantity,
      countedQuantity: l.counted_quantity,
      countedAt: l.counted_at,
      countedByName: l.counter?.display_name ?? null,
      bookAtCount: books.get(l.item_id) ?? null,
      adjustment: l.adjustment,
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName, "ko"));

  return { count: toSummary(countResult.data as SummaryRow), lines };
}

/**
 * 실사를 시작한다. 실사와 품목별 줄(시작 시점 장부 재고)은 DB 함수 start_stock_count 가 한 번에 만든다.
 * (docs/db-functions.md)
 */
export async function startStockCount(storeId: string, categoryId: string | null, memo: string | null): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_stock_count", {
    p_store_id: storeId,
    p_category_id: categoryId ?? undefined,
    p_memo: memo ?? undefined,
  });
  if (error?.code === "22P02") throw new ApiError("카테고리를 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data;
}

/** 센 수량을 기록한다. null 이면 "안 셈"으로 되돌린다. 센 시각·사람은 DB 트리거가 기록한다. */
export async function setCountedQuantity(countId: string, itemId: string, quantity: number | null) {
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
    throw new ApiError("수량은 0 이상의 숫자로 입력해 주세요.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_count_lines")
    .update({ counted_quantity: quantity === null ? null : Math.round(quantity * 1000) / 1000 })
    .eq("stock_count_id", countId)
    .eq("item_id", itemId)
    .select("item_id");
  if (error?.code === "22P02") throw new ApiError("실사를 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  // RLS에 막히면 오류 없이 0행이 바뀐다. (끝난 실사)
  if (data.length === 0) throw new ApiError("이미 끝난 실사이거나 없는 품목입니다.");
}

/**
 * 실사를 완료한다. 센 시각의 장부와의 차이만큼 조정 원장을 만드는 일은
 * DB 함수 complete_stock_count 가 한 트랜잭션으로 처리한다. 반환: 조정한 품목 수
 */
export async function completeStockCount(countId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_stock_count", { p_stock_count_id: countId });
  if (error?.code === "22P02") throw new ApiError("실사를 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data;
}

/** 진행 중인 실사를 취소한다. 센 수량은 남지만 재고에는 반영되지 않는다. (사장·매니저, RLS stock_counts_cancel) */
export async function cancelStockCount(storeId: string, countId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_counts")
    .update({ status: "cancelled" })
    .eq("store_id", storeId)
    .eq("id", countId)
    .select("id");
  if (error?.code === "22P02") throw new ApiError("실사를 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 이미 끝난 실사입니다.");
}

/**
 * 가장 최근에 끝난 실사의 완료 시각 (ISO). 없으면 null.
 * 이보다 이전 시각의 판매를 기록·취소하면 그 실사에서 센 품목의 재고는 DB 트리거가 실사 결과에 맞춰 상쇄한다
 * (supabase/migrations/..._count_backdated_sales.sql). 화면 안내용
 */
export async function getLastCountCompletedAt(storeId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_counts")
    .select("completed_at")
    .eq("store_id", storeId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ApiError(dbErrorMessage(error));
  return data?.completed_at ?? null;
}
