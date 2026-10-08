-- 품목별 최근 사용량 (소진 예상일·발주 추천용, 읽기 전용).
-- 하루 평균·소진 예상일·추천 수량 계산은 packages/core 의 usage.ts 가 한다. 여기서는 원장을 더하기만 한다.
-- SECURITY INVOKER 라 RLS 가 그대로 적용된다 (매장 구성원만 자기 매장 원장을 읽는다).
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- item_usage_summary
--   p_from 이상 p_to 미만(occurred_at)에 판매(sale)·사용(consume)으로 나간 양을 품목별로 더한다.
--   used: 나간 양 (양수. 반품으로 되돌린 양은 상계)
--   first_used_at: 이 기간에서 처음 판매·사용한 시각. p_from 전에도 판매·사용 기록이 있으면 p_from
--     (평균을 낼 날 수를 정하는 데 쓴다: 쓰기 시작한 지 며칠 안 된 품목은 그 날 수로 나눈다)
--   폐기·조정·입고는 보지 않는다. 기간 안에 판매·사용이 없는 품목은 나오지 않는다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.item_usage_summary(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  item_id uuid,
  used numeric,
  first_used_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    m.item_id,
    -sum(m.quantity),
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.stock_movements e
        WHERE e.store_id = p_store_id
          AND e.item_id = m.item_id
          AND e.type IN ('sale', 'consume')
          AND e.occurred_at < p_from
      ) THEN p_from
      ELSE min(m.occurred_at)
    END
  FROM public.stock_movements m
  WHERE m.store_id = p_store_id
    AND m.type IN ('sale', 'consume')
    AND m.occurred_at >= p_from
    AND m.occurred_at < p_to
  GROUP BY m.item_id
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.item_usage_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.item_usage_summary(uuid, timestamptz, timestamptz) TO authenticated;
