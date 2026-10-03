-- Supabase 전용 설정: 인증 연동, 매장 생성 함수, RLS 권한, 실시간 구독.
-- NestJS로 옮길 때 이 파일의 역할은 서버의 인증과 Guard가 대신한다.
-- 권한 표는 packages/core/src/permissions.ts 와 맞춰야 한다.

------------------------------------------------------------
-- 1. 인증 사용자 ↔ profiles
------------------------------------------------------------
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_auth_users_fk
  FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), '사용자')
  );
  RETURN new;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint

------------------------------------------------------------
-- 2. 권한 확인 함수
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_store_role(p_store_id uuid, p_roles public.member_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_members
    WHERE store_id = p_store_id
      AND user_id = (SELECT auth.uid())
      AND role = ANY (p_roles)
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.is_store_member(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.has_store_role(p_store_id, '{owner,manager,staff}');
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.is_store_admin(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.has_store_role(p_store_id, '{owner,manager}');
$$;
--> statement-breakpoint

------------------------------------------------------------
-- 3. 매장 생성: 매장을 만들고 만든 사람을 사장(owner)으로 등록한다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_store(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  INSERT INTO public.stores (name) VALUES (p_name) RETURNING id INTO v_store_id;
  INSERT INTO public.store_members (store_id, user_id, role) VALUES (v_store_id, auth.uid(), 'owner');
  RETURN v_store_id;
END;
$$;
--> statement-breakpoint

------------------------------------------------------------
-- 4. RLS
--   조회: 매장 구성원 전체
--   기준정보(품목, 메뉴, 레시피, 거래처, 발주) 변경: 사장, 매니저
--   입출고, 판매, 실사 입력: 구성원 전체 (조정 기록은 사장, 매니저만)
--   직원 관리, 매장 관리: 사장
------------------------------------------------------------
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.item_units ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.stock_count_lines ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.sale_records ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- stores
CREATE POLICY stores_select ON public.stores FOR SELECT TO authenticated
  USING (public.is_store_member(id));--> statement-breakpoint
CREATE POLICY stores_update ON public.stores FOR UPDATE TO authenticated
  USING (public.has_store_role(id, '{owner}'));--> statement-breakpoint
CREATE POLICY stores_delete ON public.stores FOR DELETE TO authenticated
  USING (public.has_store_role(id, '{owner}'));--> statement-breakpoint

-- profiles: 나 자신 + 같은 매장 구성원
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.store_members m
      WHERE m.user_id = profiles.id AND public.is_store_member(m.store_id)
    )
  );--> statement-breakpoint
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()));--> statement-breakpoint

-- store_members
CREATE POLICY store_members_select ON public.store_members FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY store_members_write ON public.store_members FOR ALL TO authenticated
  USING (public.has_store_role(store_id, '{owner}'))
  WITH CHECK (public.has_store_role(store_id, '{owner}'));--> statement-breakpoint

-- 기준정보: store_id 를 직접 가진 테이블
CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY categories_write ON public.categories FOR ALL TO authenticated
  USING (public.is_store_admin(store_id)) WITH CHECK (public.is_store_admin(store_id));--> statement-breakpoint

CREATE POLICY suppliers_select ON public.suppliers FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY suppliers_write ON public.suppliers FOR ALL TO authenticated
  USING (public.is_store_admin(store_id)) WITH CHECK (public.is_store_admin(store_id));--> statement-breakpoint

CREATE POLICY items_select ON public.items FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY items_write ON public.items FOR ALL TO authenticated
  USING (public.is_store_admin(store_id)) WITH CHECK (public.is_store_admin(store_id));--> statement-breakpoint

CREATE POLICY menus_select ON public.menus FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY menus_write ON public.menus FOR ALL TO authenticated
  USING (public.is_store_admin(store_id)) WITH CHECK (public.is_store_admin(store_id));--> statement-breakpoint

CREATE POLICY purchase_orders_select ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY purchase_orders_write ON public.purchase_orders FOR ALL TO authenticated
  USING (public.is_store_admin(store_id)) WITH CHECK (public.is_store_admin(store_id));--> statement-breakpoint

-- 기준정보: 부모 테이블을 통해 매장을 확인하는 테이블
CREATE POLICY item_units_select ON public.item_units FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND public.is_store_member(i.store_id)));--> statement-breakpoint
CREATE POLICY item_units_write ON public.item_units FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND public.is_store_admin(i.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND public.is_store_admin(i.store_id)));--> statement-breakpoint

CREATE POLICY recipe_ingredients_select ON public.recipe_ingredients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.menus m WHERE m.id = menu_id AND public.is_store_member(m.store_id)));--> statement-breakpoint
CREATE POLICY recipe_ingredients_write ON public.recipe_ingredients FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.menus m WHERE m.id = menu_id AND public.is_store_admin(m.store_id)))
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.menus m JOIN public.items i ON i.store_id = m.store_id
      WHERE m.id = menu_id AND i.id = item_id AND public.is_store_admin(m.store_id)
    )
  );--> statement-breakpoint

CREATE POLICY purchase_order_lines_select ON public.purchase_order_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND public.is_store_member(po.store_id)));--> statement-breakpoint
CREATE POLICY purchase_order_lines_write ON public.purchase_order_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND public.is_store_admin(po.store_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND public.is_store_admin(po.store_id)));--> statement-breakpoint

-- 실사: 시작과 수량 입력은 구성원 전체, 완료/취소(상태 변경)는 사장·매니저
CREATE POLICY stock_counts_select ON public.stock_counts FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY stock_counts_insert ON public.stock_counts FOR INSERT TO authenticated
  WITH CHECK (public.is_store_member(store_id) AND status = 'in_progress');--> statement-breakpoint
CREATE POLICY stock_counts_update ON public.stock_counts FOR UPDATE TO authenticated
  USING (public.is_store_admin(store_id)) WITH CHECK (public.is_store_admin(store_id));--> statement-breakpoint

CREATE POLICY stock_count_lines_select ON public.stock_count_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stock_counts c WHERE c.id = stock_count_id AND public.is_store_member(c.store_id)));--> statement-breakpoint
CREATE POLICY stock_count_lines_write ON public.stock_count_lines FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stock_counts c
    WHERE c.id = stock_count_id AND c.status = 'in_progress' AND public.is_store_member(c.store_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stock_counts c
    WHERE c.id = stock_count_id AND c.status = 'in_progress' AND public.is_store_member(c.store_id)
  ));--> statement-breakpoint

-- 판매: 입력은 구성원 전체, 취소(삭제)는 사장·매니저. 삭제하면 연결된 sale 입출고도 함께 지워진다.
CREATE POLICY sale_records_select ON public.sale_records FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY sale_records_insert ON public.sale_records FOR INSERT TO authenticated
  WITH CHECK (
    public.is_store_member(store_id)
    AND created_by = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.menus m WHERE m.id = menu_id AND m.store_id = sale_records.store_id)
  );--> statement-breakpoint
CREATE POLICY sale_records_delete ON public.sale_records FOR DELETE TO authenticated
  USING (public.is_store_admin(store_id));--> statement-breakpoint

-- 로트
CREATE POLICY stock_lots_select ON public.stock_lots FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY stock_lots_insert ON public.stock_lots FOR INSERT TO authenticated
  WITH CHECK (
    public.is_store_member(store_id)
    AND EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND i.store_id = stock_lots.store_id)
  );--> statement-breakpoint

-- 입출고 원장: 추가만 가능하고 수정/삭제 정책은 두지 않는다.
CREATE POLICY stock_movements_select ON public.stock_movements FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY stock_movements_insert ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.is_store_member(store_id)
    AND created_by = (SELECT auth.uid())
    AND (type <> 'adjust' OR public.is_store_admin(store_id))
    AND EXISTS (SELECT 1 FROM public.items i WHERE i.id = item_id AND i.store_id = stock_movements.store_id)
  );--> statement-breakpoint

------------------------------------------------------------
-- 5. 실시간: 재고 변화와 품목 변경을 다른 기기에 바로 반영
------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements, public.items;
