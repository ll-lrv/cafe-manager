-- 기본 템플릿 불러오기. 카테고리·품목·입고 단위·메뉴·레시피를 한 트랜잭션으로 만든다.
-- 템플릿 내용은 packages/core 의 CAFE_TEMPLATE (StoreTemplate 형태의 JSON).
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- apply_store_template
--   이미 같은 이름이 있는 카테고리·품목·메뉴는 건너뛴다 (있는 것은 바꾸지 않는다).
--   그래서 품목을 일부 등록한 매장에서 불러와도, 두 번 불러와도 안전하다.
--   새로 만든 메뉴에만 레시피를 넣는다. 레시피 재료는 같은 이름의 품목(이미 있던 것 포함)을 쓰고, 보관한 품목은 뺀다.
--   반환: {"categories": n, "items": n, "menus": n} 새로 만든 개수
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_store_template(p_store_id uuid, p_template jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
  v_item jsonb;
  v_menu jsonb;
  v_unit jsonb;
  v_line jsonb;
  v_id uuid;
  v_item_id uuid;
  v_sort integer;
  v_first boolean;
  v_categories integer := 0;
  v_items integer := 0;
  v_menus integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF NOT public.is_store_admin(p_store_id) THEN
    RAISE EXCEPTION '품목과 메뉴는 사장과 매니저만 관리할 수 있습니다.';
  END IF;
  IF jsonb_typeof(p_template -> 'categories') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_template -> 'items') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_template -> 'menus') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION '템플릿 형식이 올바르지 않습니다.';
  END IF;

  -- 같은 매장에 템플릿을 동시에 두 번 불러오는 경우를 막는다
  PERFORM 1 FROM public.stores WHERE id = p_store_id FOR UPDATE;

  -- 1. 카테고리: 기존 카테고리 뒤에 순서대로
  SELECT coalesce(max(sort_order), -1) INTO v_sort FROM public.categories WHERE store_id = p_store_id;
  FOR v_name IN SELECT jsonb_array_elements_text(p_template -> 'categories')
  LOOP
    INSERT INTO public.categories (store_id, name, sort_order)
    VALUES (p_store_id, v_name, v_sort + 1)
    ON CONFLICT (store_id, name) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_sort := v_sort + 1;
      v_categories := v_categories + 1;
    END IF;
  END LOOP;

  -- 2. 품목 + 입고 단위 (첫 단위가 기본 입고 단위)
  FOR v_item IN SELECT jsonb_array_elements(p_template -> 'items')
  LOOP
    INSERT INTO public.items (store_id, category_id, name, base_unit, min_stock, track_expiry)
    VALUES (
      p_store_id,
      (SELECT id FROM public.categories WHERE store_id = p_store_id AND name = v_item ->> 'category'),
      v_item ->> 'name',
      (v_item ->> 'baseUnit')::public.base_unit,
      (v_item ->> 'minStock')::numeric,
      (v_item ->> 'trackExpiry')::boolean
    )
    ON CONFLICT (store_id, name) DO NOTHING
    RETURNING id INTO v_id;
    CONTINUE WHEN v_id IS NULL;
    v_items := v_items + 1;

    v_first := true;
    FOR v_unit IN SELECT jsonb_array_elements(v_item -> 'units')
    LOOP
      INSERT INTO public.item_units (item_id, name, factor, is_default_purchase)
      VALUES (v_id, v_unit ->> 'name', (v_unit ->> 'factor')::numeric, v_first);
      v_first := false;
    END LOOP;
  END LOOP;

  -- 3. 메뉴 + 레시피 (새로 만든 메뉴만)
  FOR v_menu IN SELECT jsonb_array_elements(p_template -> 'menus')
  LOOP
    INSERT INTO public.menus (store_id, name, price)
    VALUES (p_store_id, v_menu ->> 'name', (v_menu ->> 'price')::integer)
    ON CONFLICT (store_id, name) DO NOTHING
    RETURNING id INTO v_id;
    CONTINUE WHEN v_id IS NULL;
    v_menus := v_menus + 1;

    FOR v_line IN SELECT jsonb_array_elements(v_menu -> 'recipe')
    LOOP
      SELECT id INTO v_item_id
      FROM public.items
      WHERE store_id = p_store_id AND name = v_line ->> 'item' AND archived_at IS NULL;
      CONTINUE WHEN v_item_id IS NULL;
      INSERT INTO public.recipe_ingredients (menu_id, item_id, quantity)
      VALUES (v_id, v_item_id, (v_line ->> 'quantity')::numeric)
      ON CONFLICT (menu_id, item_id) DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('categories', v_categories, 'items', v_items, 'menus', v_menus);
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.apply_store_template(uuid, jsonb) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.apply_store_template(uuid, jsonb) TO authenticated;
