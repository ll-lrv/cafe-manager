import "server-only";
import { CAFE_TEMPLATE } from "@cafe/core";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { ApiError, dbErrorMessage } from "./errors";

export interface TemplateResult {
  categories: number;
  items: number;
  menus: number;
}

/**
 * 카페 기본 템플릿(품목·입고 단위·메뉴·레시피)을 매장에 넣는다. 사장·매니저만.
 * 같은 이름이 이미 있으면 건너뛰므로 여러 번 불러도 안전하다. 반환은 새로 만든 개수.
 */
export async function applyCafeTemplate(storeId: string): Promise<TemplateResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_store_template", {
    p_store_id: storeId,
    // 인터페이스는 Json 의 색인 시그니처와 맞지 않아 변환한다 (값은 순수 JSON)
    p_template: CAFE_TEMPLATE as unknown as Json,
  });
  if (error) throw new ApiError(dbErrorMessage(error));
  return data as unknown as TemplateResult;
}
