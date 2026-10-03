-- 직원 초대: RLS, 초대 미리보기/수락 함수.
-- 그리고 사장(owner) 행은 클라이언트에서 바꾸거나 지울 수 없도록 구성원 정책을 좁힌다. (사장 없는 매장 방지)

------------------------------------------------------------
-- 1. 구성원 정책 보강
------------------------------------------------------------
DROP POLICY store_members_write ON public.store_members;--> statement-breakpoint

CREATE POLICY store_members_insert ON public.store_members FOR INSERT TO authenticated
  WITH CHECK (public.has_store_role(store_id, '{owner}') AND role <> 'owner');--> statement-breakpoint
CREATE POLICY store_members_update ON public.store_members FOR UPDATE TO authenticated
  USING (public.has_store_role(store_id, '{owner}') AND role <> 'owner')
  WITH CHECK (public.has_store_role(store_id, '{owner}') AND role <> 'owner');--> statement-breakpoint
CREATE POLICY store_members_delete ON public.store_members FOR DELETE TO authenticated
  USING (public.has_store_role(store_id, '{owner}') AND role <> 'owner');--> statement-breakpoint

------------------------------------------------------------
-- 2. 초대: 사장만 만들고, 보고, 취소한다.
------------------------------------------------------------
ALTER TABLE public.store_invitations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY store_invitations_select ON public.store_invitations FOR SELECT TO authenticated
  USING (public.has_store_role(store_id, '{owner}'));--> statement-breakpoint
CREATE POLICY store_invitations_insert ON public.store_invitations FOR INSERT TO authenticated
  WITH CHECK (
    public.has_store_role(store_id, '{owner}')
    AND created_by = (SELECT auth.uid())
    AND accepted_at IS NULL
  );--> statement-breakpoint
CREATE POLICY store_invitations_delete ON public.store_invitations FOR DELETE TO authenticated
  USING (public.has_store_role(store_id, '{owner}') AND accepted_at IS NULL);--> statement-breakpoint

------------------------------------------------------------
-- 3. 초대 미리보기: 아직 구성원이 아닌 사람도 링크로 매장 이름과 역할을 볼 수 있게 한다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invitation(p_token text)
RETURNS TABLE (store_name text, role public.member_role, expires_at timestamptz, is_valid boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.name, i.role, i.expires_at, (i.accepted_at IS NULL AND i.expires_at > now())
  FROM public.store_invitations i
  JOIN public.stores s ON s.id = i.store_id
  WHERE i.token = p_token;
$$;
--> statement-breakpoint

------------------------------------------------------------
-- 4. 초대 수락: 로그인한 사용자를 구성원으로 등록하고 초대를 사용 처리한다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_inv public.store_invitations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  SELECT * INTO v_inv FROM public.store_invitations WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '초대를 찾을 수 없습니다.';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION '이미 사용된 초대입니다.';
  END IF;
  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION '만료된 초대입니다.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.store_members WHERE store_id = v_inv.store_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION '이미 이 매장의 구성원입니다.';
  END IF;

  INSERT INTO public.store_members (store_id, user_id, role)
  VALUES (v_inv.store_id, auth.uid(), v_inv.role);

  UPDATE public.store_invitations
  SET accepted_by = auth.uid(), accepted_at = now()
  WHERE id = v_inv.id;

  RETURN v_inv.store_id;
END;
$$;
