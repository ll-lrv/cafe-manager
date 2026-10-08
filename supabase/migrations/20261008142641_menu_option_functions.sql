-- 메뉴 옵션 (샷 추가, 오트밀크 변경, 사이즈업): 권한, 옵션을 반영한 재료 계산, 판매 함수.
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- 1. RLS
--   옵션·규칙: 구성원은 보기, 사장·매니저는 관리 (메뉴·레시피와 같다. 권한 표의 catalog:manage)
--   판매에 붙은 옵션: 구성원은 보기. 기록은 판매 함수로만 (직접 쓰는 정책 없음), 판매를 지우면 cascade
------------------------------------------------------------
ALTER TABLE public.menu_options ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.menu_option_rules ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.sale_record_options ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY menu_options_select ON public.menu_options FOR SELECT TO authenticated
  USING (public.is_store_member(store_id));--> statement-breakpoint
CREATE POLICY menu_options_write ON public.menu_options FOR ALL TO authenticated
  USING (public.is_store_admin(store_id)) WITH CHECK (public.is_store_admin(store_id));--> statement-breakpoint

CREATE POLICY menu_option_rules_select ON public.menu_option_rules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.menu_options o WHERE o.id = option_id AND public.is_store_member(o.store_id)));--> statement-breakpoint
-- 규칙의 품목은 옵션과 같은 매장 것만
CREATE POLICY menu_option_rules_write ON public.menu_option_rules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.menu_options o WHERE o.id = option_id AND public.is_store_admin(o.store_id)))
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.menu_options o JOIN public.items i ON i.store_id = o.store_id
      WHERE o.id = option_id AND i.id = item_id AND public.is_store_admin(o.store_id)
    )
    AND (
      from_item_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.menu_options o JOIN public.items i ON i.store_id = o.store_id
        WHERE o.id = option_id AND i.id = from_item_id
      )
    )
  );--> statement-breakpoint

CREATE POLICY sale_record_options_select ON public.sale_record_options FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sale_records s WHERE s.id = sale_record_id AND public.is_store_member(s.store_id)));--> statement-breakpoint

CREATE TRIGGER menu_options_set_updated_at BEFORE UPDATE ON public.menu_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

------------------------------------------------------------
-- 2. 옵션 규칙에 쓰인 품목도 기본 단위를 바꿀 수 없다 (규칙 수량이 기본 단위라서)
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_item_base_unit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF new.base_unit IS DISTINCT FROM old.base_unit AND (
    EXISTS (SELECT 1 FROM public.stock_movements WHERE item_id = old.id)
    OR EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE item_id = old.id)
    OR EXISTS (SELECT 1 FROM public.menu_option_rules WHERE item_id = old.id OR from_item_id = old.id)
  ) THEN
    RAISE EXCEPTION '입출고·레시피·옵션에 쓰인 품목은 기본 단위를 바꿀 수 없습니다.';
  END IF;
  RETURN new;
END;
$$;
--> statement-breakpoint

------------------------------------------------------------
-- 3. sale_ingredients (내부 전용)
--   메뉴 1개 + 옵션 묶음의 재료(기본 단위). packages/core 의 applyOptions 와 같은 계산:
--   늘리기(scale, 레시피에 있는 재료만 곱함) → 바꾸기(replace, 늘린 뒤 양 기준으로 한 번씩만,
--   같은 재료를 바꾸는 규칙이 여럿이면 item_id 가 작은 것 하나) → 추가(add). 0 이하는 뺀다.
--   호출하는 쪽에서 옵션이 메뉴와 같은 매장 것인지 확인한다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sale_ingredients(p_menu_id uuid, p_option_ids uuid[])
RETURNS TABLE (item_id uuid, quantity numeric)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_map jsonb;
  v_snap jsonb;
  v_rule record;
  v_moved numeric;
BEGIN
  SELECT coalesce(jsonb_object_agg(ri.item_id::text, ri.quantity), '{}'::jsonb) INTO v_map
  FROM public.recipe_ingredients ri WHERE ri.menu_id = p_menu_id;

  FOR v_rule IN
    SELECT r.item_id, r.quantity FROM public.menu_option_rules r
    WHERE r.option_id = ANY(coalesce(p_option_ids, '{}')) AND r.kind = 'scale'
  LOOP
    IF v_map ? v_rule.item_id::text THEN
      v_map := jsonb_set(v_map, ARRAY[v_rule.item_id::text],
        to_jsonb((v_map ->> v_rule.item_id::text)::numeric * v_rule.quantity));
    END IF;
  END LOOP;

  v_snap := v_map;
  FOR v_rule IN
    SELECT DISTINCT ON (r.from_item_id) r.from_item_id, r.item_id FROM public.menu_option_rules r
    WHERE r.option_id = ANY(coalesce(p_option_ids, '{}')) AND r.kind = 'replace'
    ORDER BY r.from_item_id, r.item_id
  LOOP
    IF v_snap ? v_rule.from_item_id::text THEN
      v_moved := (v_snap ->> v_rule.from_item_id::text)::numeric;
      v_map := jsonb_set(v_map, ARRAY[v_rule.from_item_id::text],
        to_jsonb((v_map ->> v_rule.from_item_id::text)::numeric - v_moved));
      v_map := jsonb_set(v_map, ARRAY[v_rule.item_id::text],
        to_jsonb(coalesce((v_map ->> v_rule.item_id::text)::numeric, 0) + v_moved));
    END IF;
  END LOOP;

  FOR v_rule IN
    SELECT r.item_id, r.quantity FROM public.menu_option_rules r
    WHERE r.option_id = ANY(coalesce(p_option_ids, '{}')) AND r.kind = 'add'
  LOOP
    v_map := jsonb_set(v_map, ARRAY[v_rule.item_id::text],
      to_jsonb(coalesce((v_map ->> v_rule.item_id::text)::numeric, 0) + v_rule.quantity));
  END LOOP;

  RETURN QUERY
    SELECT e.key::uuid, round(e.value::numeric, 3)
    FROM jsonb_each_text(v_map) e
    WHERE round(e.value::numeric, 3) > 0
    ORDER BY e.key::uuid;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.sale_ingredients(uuid, uuid[]) FROM PUBLIC, anon, authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 4. record_sales: 옵션
--   p_lines: [{"menu_id": uuid, "quantity": 정수, "amount": 정수|null, "option_ids": [uuid]|null}]
--   같은 메뉴라도 옵션 묶음이 다르면 다른 줄. amount 가 없으면 (메뉴 가격 + 옵션 금액) × 수량
--   옵션은 같은 매장의 보관되지 않은 것만, 한 줄에 같은 옵션 두 번은 안 된다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_sales(p_lines jsonb, p_sold_at timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store_id uuid;
  v_line record;
  v_menu public.menus%ROWTYPE;
  v_options uuid[];
  v_option_price integer;
  v_option_names text;
  v_name text;
  v_ingredient record;
  v_sale_id uuid;
  v_count integer := 0;
  v_lines integer;
  v_found integer;
  v_stores integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION '판매할 메뉴를 입력해 주세요.';
  END IF;
  IF jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION '한 번에 200개 메뉴까지 기록할 수 있습니다.';
  END IF;
  IF p_sold_at IS NULL OR p_sold_at > now() + interval '10 minutes' THEN
    RAISE EXCEPTION '판매 시각을 확인해 주세요. 미래 시각은 기록할 수 없습니다.';
  END IF;

  -- 모든 메뉴가 있고, 한 매장 것이고, 그 매장 구성원인지 확인 (권한 표: sale:record)
  SELECT count(*), count(m.id), count(DISTINCT m.store_id), min(m.store_id::text)::uuid
  INTO v_lines, v_found, v_stores, v_store_id
  FROM jsonb_to_recordset(p_lines) AS x(menu_id uuid)
  LEFT JOIN public.menus m ON m.id = x.menu_id;
  IF v_found <> v_lines OR v_stores <> 1 OR NOT public.is_store_member(v_store_id) THEN
    RAISE EXCEPTION '메뉴를 찾을 수 없습니다.';
  END IF;

  -- 차감할 재료 품목(레시피 + 옵션 규칙)을 id 순으로 잠근다. (입출고·다른 판매와 동시에 기록해도 로트 계산이 겹치지 않고, 교착도 피한다)
  PERFORM 1 FROM public.items
  WHERE id IN (
    SELECT ri.item_id FROM public.recipe_ingredients ri
    WHERE ri.menu_id IN (SELECT x.menu_id FROM jsonb_to_recordset(p_lines) AS x(menu_id uuid))
    UNION
    SELECT r.item_id FROM public.menu_option_rules r
    WHERE r.option_id IN (
      SELECT o.value::uuid FROM jsonb_array_elements(p_lines) l, jsonb_array_elements_text(coalesce(l.value -> 'option_ids', '[]')) o
    )
  )
  ORDER BY id
  FOR UPDATE;

  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(menu_id uuid, quantity integer, amount integer, option_ids uuid[])
  LOOP
    SELECT * INTO v_menu FROM public.menus WHERE id = v_line.menu_id;
    IF v_menu.archived_at IS NOT NULL THEN
      RAISE EXCEPTION '보관된 메뉴입니다: %', v_menu.name;
    END IF;
    IF v_line.quantity IS NULL OR v_line.quantity <= 0 OR v_line.quantity > 10000 THEN
      RAISE EXCEPTION '판매 수량을 확인해 주세요: %', v_menu.name;
    END IF;
    IF v_line.amount IS NOT NULL AND v_line.amount < 0 THEN
      RAISE EXCEPTION '판매 금액을 확인해 주세요: %', v_menu.name;
    END IF;

    -- 옵션: 같은 매장, 보관 안 됨, 중복 없음
    v_options := coalesce(v_line.option_ids, '{}');
    IF cardinality(v_options) > 20 THEN
      RAISE EXCEPTION '옵션은 한 메뉴에 20개까지 붙일 수 있습니다.';
    END IF;
    IF cardinality(v_options) <> (SELECT count(DISTINCT o) FROM unnest(v_options) o) THEN
      RAISE EXCEPTION '같은 옵션을 두 번 붙일 수 없습니다: %', v_menu.name;
    END IF;
    SELECT count(o.id), coalesce(sum(o.price), 0), string_agg(o.name, ' + ' ORDER BY o.name)
    INTO v_found, v_option_price, v_option_names
    FROM public.menu_options o
    WHERE o.id = ANY(v_options) AND o.store_id = v_store_id AND o.archived_at IS NULL;
    IF v_found <> cardinality(v_options) THEN
      RAISE EXCEPTION '옵션을 찾을 수 없습니다: %', v_menu.name;
    END IF;
    v_name := v_menu.name || coalesce(' + ' || v_option_names, '');

    INSERT INTO public.sale_records (store_id, menu_id, quantity, amount, sold_at, source, created_by)
    VALUES (v_store_id, v_menu.id, v_line.quantity,
            coalesce(v_line.amount, (v_menu.price + v_option_price) * v_line.quantity),
            p_sold_at, 'manual', v_uid)
    RETURNING id INTO v_sale_id;
    INSERT INTO public.sale_record_options (sale_record_id, option_id)
    SELECT v_sale_id, unnest(v_options);

    -- 옵션을 반영한 재료 차감 (packages/core 의 applyOptions × 판매 수량)
    FOR v_ingredient IN SELECT * FROM public.sale_ingredients(v_menu.id, v_options)
    LOOP
      PERFORM public.stock_outflow(
        v_ingredient.item_id, 'sale', round(v_ingredient.quantity * v_line.quantity, 3), NULL, 1,
        format('판매: %s %s개', v_name, v_line.quantity), v_uid, p_sold_at, v_sale_id
      );
    END LOOP;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
--> statement-breakpoint

------------------------------------------------------------
-- 5. menu_sales_summary: 옵션 묶음별로 나눈다 (옵션마다 재료비가 다르므로)
--   option_ids: 정렬된 옵션 id 배열, 옵션이 없으면 빈 배열
------------------------------------------------------------
DROP FUNCTION public.menu_sales_summary(uuid, timestamptz, timestamptz);--> statement-breakpoint

CREATE FUNCTION public.menu_sales_summary(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  menu_id uuid,
  option_ids uuid[],
  quantity bigint,
  amount bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT s.menu_id, s.option_ids, sum(s.quantity)::bigint, coalesce(sum(s.amount), 0)::bigint
  FROM (
    SELECT r.menu_id, r.quantity, r.amount,
      coalesce((SELECT array_agg(o.option_id ORDER BY o.option_id) FROM public.sale_record_options o WHERE o.sale_record_id = r.id), '{}') AS option_ids
    FROM public.sale_records r
    WHERE r.store_id = p_store_id
      AND r.sold_at >= p_from
      AND r.sold_at < p_to
  ) s
  GROUP BY s.menu_id, s.option_ids
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.menu_sales_summary(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.menu_sales_summary(uuid, timestamptz, timestamptz) TO authenticated;
