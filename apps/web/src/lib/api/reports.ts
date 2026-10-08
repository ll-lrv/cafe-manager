import "server-only";
import type { MenuSalesTotal, UsageTotals } from "@cafe/core";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";

/** 기간(from 이상 to 미만, ISO) 동안 품목별 원장 합계. 이론 vs 실제 리포트용 */
export async function getUsageTotals(storeId: string, range: { from: string; to: string }): Promise<UsageTotals[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_usage_summary", {
    p_store_id: storeId,
    p_from: range.from,
    p_to: range.to,
  });
  if (error) throw new ApiError(dbErrorMessage(error));
  return data.map((r) => ({
    itemId: r.item_id,
    received: Number(r.received),
    sold: Number(r.sold),
    consumed: Number(r.consumed),
    wasted: Number(r.wasted),
    countAdjusted: Number(r.count_adjusted),
    manualAdjusted: Number(r.manual_adjusted),
    counted: r.counted,
  }));
}

/** 기간(from 이상 to 미만, ISO) 동안 메뉴별 판매량·매출 합계. 취소·반품(음수)은 상계된다 */
export async function getMenuSales(storeId: string, range: { from: string; to: string }): Promise<MenuSalesTotal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("menu_sales_summary", {
    p_store_id: storeId,
    p_from: range.from,
    p_to: range.to,
  });
  if (error) throw new ApiError(dbErrorMessage(error));
  return data.map((r) => ({ menuId: r.menu_id, quantity: Number(r.quantity), amount: Number(r.amount) }));
}
