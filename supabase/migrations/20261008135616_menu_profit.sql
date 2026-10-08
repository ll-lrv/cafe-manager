-- 메뉴 수익성 순위·목표 원가율.
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- 1. 사장은 매장의 목표 원가율도 바꿀 수 있다 (stores 는 컬럼 권한으로 바꿀 칸을 제한한다)
--    메뉴의 목표 원가율은 menus 의 다른 칸처럼 menus_write(사장·매니저) 정책을 따른다.
------------------------------------------------------------
GRANT UPDATE (target_cost_rate) ON public.stores TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 2. menu_sales_summary
--   p_from 이상 p_to 미만(sold_at)의 판매를 메뉴별로 더한다 (읽기 전용, 리포트용).
--   취소·반품(음수 판매)도 그대로 더해 상계된다. 금액이 없는 판매(amount null)는 0원으로 더한다.
--   판매를 한 줄씩 읽으면 API 의 최대 행 수(1,000)에 걸려 큰 기간의 합계가 틀어지므로 DB 에서 더한다.
--   SECURITY INVOKER 라 RLS 가 그대로 적용된다 (매장 구성원만 자기 매장 판매를 읽는다).
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.menu_sales_summary(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  menu_id uuid,
  quantity bigint,
  amount bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT s.menu_id, sum(s.quantity)::bigint, coalesce(sum(s.amount), 0)::bigint
  FROM public.sale_records s
  WHERE s.store_id = p_store_id
    AND s.sold_at >= p_from
    AND s.sold_at < p_to
  GROUP BY s.menu_id
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.menu_sales_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.menu_sales_summary(uuid, timestamptz, timestamptz) TO authenticated;
