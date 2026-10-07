-- 판매 취소를 다른 기기에 바로 알린다.
-- Realtime 의 postgres_changes 는 DELETE 에 필터(store_id)도 RLS 도 걸리지 않아, 구독하면 모든 매장의 삭제가 모든 사용자에게 간다.
-- 그래서 삭제될 때 DB가 매장 전용 비공개 채널(store:<매장 id>)로 방송하고, 그 매장 구성원만 받게 한다.
-- NestJS 전환 시: 판매 취소 서비스에서 WebSocket/SSE 게이트웨이로 같은 이벤트를 보내고 이 트리거는 지운다.

------------------------------------------------------------
-- 1. 판매가 지워지면 방송
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broadcast_sale_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('sale_id', old.id),
    'sale_cancelled',
    'store:' || old.store_id::text,
    true
  );
  RETURN old;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.broadcast_sale_cancelled() FROM PUBLIC, anon, authenticated;--> statement-breakpoint

CREATE TRIGGER sale_records_broadcast_cancel AFTER DELETE ON public.sale_records
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_sale_cancelled();--> statement-breakpoint

------------------------------------------------------------
-- 2. 비공개 채널 store:<매장 id> 는 그 매장 구성원만 받는다.
--   보내기(INSERT) 정책은 두지 않아, 브라우저에서는 이 채널로 보낼 수 없다.
------------------------------------------------------------
CREATE POLICY store_members_receive_broadcast ON realtime.messages FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND public.is_store_member(substring(realtime.topic() FROM '^store:([0-9a-f-]{36})$')::uuid)
  );
