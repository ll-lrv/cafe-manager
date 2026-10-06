import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * 매장의 재고·품목·판매가 바뀌면 onChange 를 부른다. (다른 기기에서 기록한 입출고·판매 포함)
 * 삭제(판매 취소)는 필터를 걸 수 없어 전달되지 않는다. 취소한 기기에서만 바로 보이고 다른 기기는 다음 변경 때 반영된다.
 * 브라우저에서만 쓴다. RLS 로 내 매장 행만 전달된다.
 * NestJS 전환 시: WebSocket/SSE 게이트웨이 구독으로 바꾼다. (docs/db-functions.md "Supabase 전용 기능")
 */
export function subscribeStoreChanges(storeId: string, onChange: () => void): () => void {
  const supabase = createClient();
  const filter = `store_id=eq.${storeId}`;
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  void (async () => {
    // 쿠키 세션은 Realtime 연결에 자동으로 실리지 않는다. 토큰 없이 구독하면 익명으로 취급되어
    // RLS 에 막혀 아무 이벤트도 오지 않으므로, 로그인 토큰을 먼저 넣고 구독한다.
    const { data } = await supabase.auth.getSession();
    if (cancelled || !data.session) return;
    await supabase.realtime.setAuth(data.session.access_token);
    if (cancelled) return;
    channel = supabase
      .channel(`store-changes:${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements", filter }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter }, onChange)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sale_records", filter }, onChange)
      .subscribe();
  })();

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
