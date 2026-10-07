import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * 매장의 재고·품목·판매가 바뀌면 onChange 를 부른다. (다른 기기에서 기록한 입출고·판매·판매 취소 포함)
 * 브라우저에서만 쓴다. RLS 로 내 매장 행만 전달된다.
 * 판매 취소(삭제)는 postgres_changes 로 매장을 거를 수 없어, DB 트리거가 매장 전용 비공개 채널(store:<id>)로 방송한다.
 * NestJS 전환 시: WebSocket/SSE 게이트웨이 구독으로 바꾼다. (docs/db-functions.md "Supabase 전용 기능")
 */
export function subscribeStoreChanges(storeId: string, onChange: () => void): () => void {
  const filter = `store_id=eq.${storeId}`;
  const unsubscribeChanges = subscribe(`store-changes:${storeId}`, (channel) =>
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements", filter }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter }, onChange)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sale_records", filter }, onChange),
  );
  const unsubscribeBroadcast = subscribe(
    `store:${storeId}`,
    (channel) => channel.on("broadcast", { event: "sale_cancelled" }, onChange),
    { private: true },
  );
  return () => {
    unsubscribeChanges();
    unsubscribeBroadcast();
  };
}

/** 진행 중인 실사에서 다른 사람이 센 수량을 입력하면 onChange 를 부른다. */
export function subscribeStockCount(countId: string, onChange: () => void): () => void {
  return subscribe(`stock-count:${countId}`, (channel) =>
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "stock_count_lines", filter: `stock_count_id=eq.${countId}` },
      onChange,
    ),
  );
}

/**
 * 로그인 토큰을 넣고 채널을 구독한다. 반환: 구독 해제 함수
 * private 이면 비공개 채널: realtime.messages 의 RLS 정책을 통과한 사람만 받는다.
 */
function subscribe(
  name: string,
  setup: (channel: RealtimeChannel) => RealtimeChannel,
  { private: isPrivate = false }: { private?: boolean } = {},
): () => void {
  const supabase = createClient();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  void (async () => {
    // 쿠키 세션은 Realtime 연결에 자동으로 실리지 않는다. 토큰 없이 구독하면 익명으로 취급되어
    // RLS 에 막혀 아무 이벤트도 오지 않으므로, 로그인 토큰을 먼저 넣고 구독한다.
    const { data } = await supabase.auth.getSession();
    if (cancelled || !data.session) return;
    await supabase.realtime.setAuth(data.session.access_token);
    if (cancelled) return;
    channel = setup(supabase.channel(name, { config: { private: isPrivate } })).subscribe();
  })();

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
