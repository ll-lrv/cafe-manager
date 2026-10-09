-- 전체 코드 점검(2026-10-09)에서 찾은 문제 두 가지.
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- 1. set_default_item_unit: 기본 입고 단위 바꾸기를 한 트랜잭션으로
--   예전에는 화면 쪽에서 "기존 기본 해제 → 새 단위 지정"을 따로 보내, 두 번째가 실패하면 기본 단위가 없어졌다.
--   (품목당 기본 단위는 하나라는 부분 유일 인덱스 때문에 지정보다 해제가 먼저여야 한다)
--   SECURITY INVOKER: RLS(item_units_write, 사장·매니저)가 그대로 적용된다. 막히면 0행이 바뀌어 오류를 낸다.
------------------------------------------------------------
CREATE FUNCTION public.set_default_item_unit(p_item_id uuid, p_unit_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.item_units WHERE id = p_unit_id AND item_id = p_item_id) THEN
    RAISE EXCEPTION '권한이 없거나 없는 단위입니다.';
  END IF;
  UPDATE public.item_units SET is_default_purchase = false
  WHERE item_id = p_item_id AND is_default_purchase AND id <> p_unit_id;
  UPDATE public.item_units SET is_default_purchase = true
  WHERE id = p_unit_id AND item_id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '권한이 없거나 없는 단위입니다.';
  END IF;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.set_default_item_unit(uuid, uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_default_item_unit(uuid, uuid) TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 2. 구성원은 초대 수락(accept_invitation)과 매장 만들기(create_store)로만 생긴다
--   예전 정책 store_members_insert 는 사장이 초대 없이 아무 사용자(ID)나 자기 매장 구성원으로 넣을 수 있었다.
--   두 함수는 SECURITY DEFINER 라 이 정책 없이도 동작한다. 앱은 구성원을 직접 넣지 않는다.
--   수정도 역할(role)만 바꿀 수 있게 한다 (예전에는 user_id·store_id 도 바꿀 수 있었다).
------------------------------------------------------------
DROP POLICY store_members_insert ON public.store_members;--> statement-breakpoint
REVOKE INSERT, UPDATE ON public.store_members FROM authenticated;--> statement-breakpoint
GRANT UPDATE (role) ON public.store_members TO authenticated;
