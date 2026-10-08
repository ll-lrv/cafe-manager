import "server-only";
import type { OptionWordChoice } from "@cafe/core";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";
import { requireUser } from "./session";

/** import_sales 한 번에 보낼 수 있는 행 수 (DB 함수와 같음) */
export const IMPORT_CHUNK_SIZE = 500;

export interface ImportSaleRow {
  menuId: string;
  quantity: number;
  /** 원. null 이면 (메뉴 가격 + 옵션 금액) × 수량 */
  amount: number | null;
  /** 붙인 옵션 (옵션 열에서 옵션으로 고른 낱말) */
  optionIds: string[];
  /** ISO 시각 */
  soldAt: string;
  /** 같은 행을 두 번 가져오지 않기 위한 키 */
  externalId: string;
}

export interface SaleImport {
  id: string;
  fileName: string;
  createdAt: string;
  createdByName: string | null;
  /** 지금 남아 있는 판매 (취소된 판매는 빠진다) */
  saleCount: number;
  quantity: number;
  amount: number;
  /** 판매 시각 범위 */
  firstSoldAt: string | null;
  lastSoldAt: string | null;
}

/** 파일의 메뉴 이름 → 메뉴 id (null 이면 가져오지 않음) */
export async function getMenuAliases(storeId: string): Promise<Record<string, string | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("menu_aliases").select("source_name, menu_id").eq("store_id", storeId);
  if (error) throw new ApiError(dbErrorMessage(error));
  return Object.fromEntries(data.map((a) => [a.source_name, a.menu_id]));
}

/** 메뉴 이름 매칭을 저장한다 (다음 가져오기 때 자동으로 맞춘다). 이름마다 한 줄이라 한 번에 upsert 한다. */
export async function saveMenuAliases(storeId: string, aliases: Record<string, string | null>) {
  const rows = Object.entries(aliases).map(([sourceName, menuId]) => ({
    store_id: storeId,
    source_name: sourceName,
    menu_id: menuId,
  }));
  if (rows.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("menu_aliases").upsert(rows, { onConflict: "store_id,source_name" });
  if (error?.code === "42501") throw new ApiError("판매 가져오기는 사장과 매니저만 할 수 있습니다.");
  if (error?.code === "22P02") throw new ApiError("메뉴를 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
}

/** 옵션 열 낱말 → 옵션 / 메뉴 이름에 붙임 / 무시 */
export async function getOptionAliases(storeId: string): Promise<Record<string, OptionWordChoice>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("option_aliases").select("source_name, kind, option_id").eq("store_id", storeId);
  if (error) throw new ApiError(dbErrorMessage(error));
  return Object.fromEntries(
    data.map((a): [string, OptionWordChoice] => [
      a.source_name,
      a.kind === "option" && a.option_id ? { kind: "option", optionId: a.option_id } : { kind: a.kind === "ignore" ? "ignore" : "menu" },
    ]),
  );
}

/** 옵션 열 낱말 매칭을 저장한다 (다음 가져오기 때 자동으로 맞춘다) */
export async function saveOptionAliases(storeId: string, aliases: Record<string, OptionWordChoice>) {
  const rows = Object.entries(aliases).map(([sourceName, c]) => ({
    store_id: storeId,
    source_name: sourceName,
    kind: c.kind,
    option_id: c.kind === "option" ? c.optionId : null,
  }));
  if (rows.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from("option_aliases").upsert(rows, { onConflict: "store_id,source_name" });
  if (error?.code === "42501") throw new ApiError("판매 가져오기는 사장과 매니저만 할 수 있습니다.");
  if (error?.code === "22P02") throw new ApiError("옵션을 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
}

/** 가져오기 한 번을 만든다. 판매 행은 importSaleRows 로 나눠 넣는다. */
export async function createSaleImport(storeId: string, fileName: string): Promise<string> {
  const name = fileName.trim().slice(0, 200) || "판매 파일";
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_imports")
    .insert({ store_id: storeId, file_name: name, created_by: user.id })
    .select("id")
    .single();
  if (error?.code === "42501") throw new ApiError("판매 가져오기는 사장과 매니저만 할 수 있습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data.id;
}

/**
 * 판매 행을 넣는다. 판매 기록과 레시피대로의 재료 차감은 DB 함수 import_sales 가 한 트랜잭션으로 처리하고,
 * 이미 가져온 행(같은 키)은 건너뛴다. (docs/db-functions.md) 반환: 새로 넣은 건수
 */
export async function importSaleRows(importId: string, rows: ImportSaleRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  if (rows.length > IMPORT_CHUNK_SIZE) throw new ApiError(`한 번에 ${IMPORT_CHUNK_SIZE}건까지 보낼 수 있습니다.`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_sales", {
    p_import_id: importId,
    p_rows: rows.map((r) => ({
      menu_id: r.menuId,
      quantity: r.quantity,
      amount: r.amount,
      sold_at: r.soldAt,
      external_id: r.externalId,
      option_ids: r.optionIds,
    })),
  });
  if (error?.code === "22P02") throw new ApiError("메뉴를 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data;
}

type ImportRow = {
  id: string;
  file_name: string;
  created_at: string;
  creator: { display_name: string } | null;
};

/** 최근 가져오기 (남아 있는 판매 합계 포함, 뷰 sale_import_summaries) */
export async function listSaleImports(storeId: string, limit = 10): Promise<SaleImport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_imports")
    .select("id, file_name, created_at, creator:profiles(display_name)")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new ApiError(dbErrorMessage(error));
  const imports = data as ImportRow[];
  if (imports.length === 0) return [];
  const { data: sums, error: sumError } = await supabase
    .from("sale_import_summaries")
    .select("import_id, sale_count, quantity, amount, first_sold_at, last_sold_at")
    .in(
      "import_id",
      imports.map((i) => i.id),
    );
  if (sumError) throw new ApiError(dbErrorMessage(sumError));
  const sumById = new Map(sums.map((s) => [s.import_id, s]));
  return imports.map((i) => {
    const s = sumById.get(i.id);
    return {
      id: i.id,
      fileName: i.file_name,
      createdAt: i.created_at,
      createdByName: i.creator?.display_name ?? null,
      saleCount: s?.sale_count ?? 0,
      quantity: s?.quantity ?? 0,
      amount: s?.amount ?? 0,
      firstSoldAt: s?.first_sold_at ?? null,
      lastSoldAt: s?.last_sold_at ?? null,
    };
  });
}

/**
 * 가져오기를 취소한다. 그때 들어온 판매와 재료 차감이 DB에서 함께 지워진다(FK cascade).
 * 판매 취소와 같은 원장 삭제 예외. 사장·매니저만 (RLS sale_imports_delete)
 */
export async function cancelSaleImport(storeId: string, importId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_imports")
    .delete()
    .eq("store_id", storeId)
    .eq("id", importId)
    .select("id");
  if (error?.code === "22P02") throw new ApiError("없는 가져오기 기록입니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 가져오기 기록입니다.");
}
