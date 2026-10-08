import "server-only";
import type { UsageTotals } from "@cafe/core";
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
