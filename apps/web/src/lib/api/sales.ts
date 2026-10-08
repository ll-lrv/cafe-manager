import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";

export interface SaleLine {
  menuId: string;
  /** 판매 수량 (1 이상의 정수) */
  quantity: number;
  /** 붙인 옵션 (같은 메뉴라도 옵션 묶음이 다르면 다른 줄) */
  optionIds: string[];
}

export interface Sale {
  id: string;
  menuId: string;
  menuName: string;
  /** 붙인 옵션 이름 (이름 순) */
  optionNames: string[];
  quantity: number;
  /** 판매 금액 합계, 원 */
  amount: number;
  soldAt: string;
  /** 직접 입력, CSV 가져오기, POS */
  source: "manual" | "csv" | "pos";
  createdByName: string | null;
}

/**
 * 여러 메뉴의 판매를 한 번에 기록한다. 판매 기록과 레시피대로의 재료 차감(유통기한 순)은
 * DB 함수 record_sales 가 한 트랜잭션으로 처리한다. (docs/db-functions.md)
 * soldAt 이 없으면 지금 시각.
 */
export async function recordSales(lines: SaleLine[], soldAt: string | null): Promise<number> {
  const valid = lines.filter((l) => l.quantity !== 0);
  if (valid.length === 0) throw new ApiError("판매 수량을 입력해 주세요.");
  if (valid.some((l) => !Number.isInteger(l.quantity) || l.quantity < 0 || l.quantity > 10000)) {
    throw new ApiError("판매 수량은 1 이상의 정수로 입력해 주세요.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_sales", {
    p_lines: valid.map((l) => ({ menu_id: l.menuId, quantity: l.quantity, option_ids: l.optionIds })),
    p_sold_at: soldAt ?? undefined,
  });
  if (error?.code === "22P02") throw new ApiError("메뉴를 찾을 수 없습니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  return data;
}

type SaleRow = {
  id: string;
  menu_id: string;
  quantity: number;
  amount: number | null;
  sold_at: string;
  source: "manual" | "csv" | "pos";
  menu: { name: string } | null;
  options: { option: { name: string } | null }[];
  creator: { display_name: string } | null;
};

/** 기간 안의 판매 기록 (from 이상, to 미만). 최근 것부터 */
export async function listSales(storeId: string, range: { from: string; to: string }): Promise<Sale[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_records")
    .select("id, menu_id, quantity, amount, sold_at, source, menu:menus(name), options:sale_record_options(option:menu_options(name)), creator:profiles(display_name)")
    .eq("store_id", storeId)
    .gte("sold_at", range.from)
    .lt("sold_at", range.to)
    .order("sold_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new ApiError(dbErrorMessage(error));
  return (data as SaleRow[]).map((s) => ({
    id: s.id,
    menuId: s.menu_id,
    menuName: s.menu?.name ?? "알 수 없는 메뉴",
    optionNames: s.options.flatMap((o) => (o.option ? [o.option.name] : [])).sort((a, b) => a.localeCompare(b, "ko")),
    quantity: s.quantity,
    amount: s.amount ?? 0,
    soldAt: s.sold_at,
    source: s.source,
    createdByName: s.creator?.display_name ?? null,
  }));
}

/**
 * 판매를 취소한다. 판매 기록을 지우면 연결된 재료 차감 원장도 DB에서 함께 지워진다(FK cascade).
 * 원장 삭제 금지 규칙의 유일한 예외. 사장·매니저만 (RLS sale_records_delete)
 */
export async function cancelSale(storeId: string, saleId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_records")
    .delete()
    .eq("store_id", storeId)
    .eq("id", saleId)
    .select("id");
  if (error?.code === "22P02") throw new ApiError("없는 판매 기록입니다.");
  if (error) throw new ApiError(dbErrorMessage(error));
  if (data.length === 0) throw new ApiError("권한이 없거나 없는 판매 기록입니다.");
}
