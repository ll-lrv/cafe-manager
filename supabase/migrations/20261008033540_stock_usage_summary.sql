-- 기간 동안의 품목별 입출고 합계 (이론 vs 실제 리포트용, 읽기 전용).
-- 계산(이론·실제·차이·금액)은 packages/core 의 avt.ts 가 한다. 여기서는 원장을 종류별로 더하기만 한다.
-- SECURITY INVOKER 라 RLS 가 그대로 적용된다 (매장 구성원만 자기 매장 원장을 읽는다).
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- stock_usage_summary
--   p_from 이상 p_to 미만(occurred_at)의 원장을 품목별로 더한다. 값은 원장 그대로 부호 포함.
--   실사 조정(stock_count_id 있음)과 직접 조정(없음)을 나눈다.
--   counted: 이 기간에 끝난 실사에서 센 품목인지 (차이가 0 이라 조정 원장이 없어도 true).
--     false 면 실사 차이를 알 수 없다 (차이 0 이 "맞았다"는 뜻이 아니다).
--   움직임이 없는 품목은 나오지 않는다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_usage_summary(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  item_id uuid,
  received numeric,
  sold numeric,
  consumed numeric,
  wasted numeric,
  count_adjusted numeric,
  manual_adjusted numeric,
  counted boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    m.item_id,
    coalesce(sum(m.quantity) FILTER (WHERE m.type = 'receive'), 0),
    coalesce(sum(m.quantity) FILTER (WHERE m.type = 'sale'), 0),
    coalesce(sum(m.quantity) FILTER (WHERE m.type = 'consume'), 0),
    coalesce(sum(m.quantity) FILTER (WHERE m.type = 'waste'), 0),
    coalesce(sum(m.quantity) FILTER (WHERE m.type = 'adjust' AND m.stock_count_id IS NOT NULL), 0),
    coalesce(sum(m.quantity) FILTER (WHERE m.type = 'adjust' AND m.stock_count_id IS NULL), 0),
    EXISTS (
      SELECT 1
      FROM public.stock_count_lines l
      JOIN public.stock_counts c ON c.id = l.stock_count_id
      WHERE l.item_id = m.item_id
        AND l.counted_quantity IS NOT NULL
        AND c.status = 'completed'
        AND c.completed_at >= p_from
        AND c.completed_at < p_to
    )
  FROM public.stock_movements m
  WHERE m.store_id = p_store_id
    AND m.occurred_at >= p_from
    AND m.occurred_at < p_to
  GROUP BY m.item_id
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.stock_usage_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.stock_usage_summary(uuid, timestamptz, timestamptz) TO authenticated;
