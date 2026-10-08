-- CSV 가져오기에서 취소·반품 줄도 반영한다.
--   수량이 음수인 행 = 취소·반품: 판매를 음수로 기록하고(매출 상계), 레시피 재료를 그만큼 되돌린다(sale 원장 +).
--   되돌린 재료는 유통기한 로트 없이 들어간다 (실사로 늘어난 양과 같음).
--   이론 vs 실제 리포트의 "판매로 차감된 양"도 원장 합계라 자동으로 상계된다.
--   하나씩 취소한 판매의 키 건너뛰기(..._sale_cancel_keys.sql)는 그대로 둔다.
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

CREATE OR REPLACE FUNCTION public.import_sales(p_import_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store_id uuid;
  v_row record;
  v_menu public.menus%ROWTYPE;
  v_ingredient record;
  v_sale_id uuid;
  v_amount integer;
  v_count integer := 0;
  v_lines integer;
  v_found integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  SELECT store_id INTO v_store_id FROM public.sale_imports WHERE id = p_import_id;
  IF NOT FOUND OR NOT public.is_store_admin(v_store_id) THEN
    RAISE EXCEPTION '판매 가져오기는 사장과 매니저만 할 수 있습니다.';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION '가져올 판매가 없습니다.';
  END IF;
  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION '한 번에 500건까지 가져올 수 있습니다.';
  END IF;

  -- 모든 메뉴가 이 매장 것인지
  SELECT count(*), count(m.id) INTO v_lines, v_found
  FROM jsonb_to_recordset(p_rows) AS x(menu_id uuid)
  LEFT JOIN public.menus m ON m.id = x.menu_id AND m.store_id = v_store_id;
  IF v_found <> v_lines THEN
    RAISE EXCEPTION '메뉴를 찾을 수 없습니다.';
  END IF;

  -- 차감할 재료 품목을 id 순으로 잠근다. (record_sales 와 같은 이유)
  PERFORM 1 FROM public.items
  WHERE id IN (
    SELECT ri.item_id FROM public.recipe_ingredients ri
    WHERE ri.menu_id IN (SELECT x.menu_id FROM jsonb_to_recordset(p_rows) AS x(menu_id uuid))
  )
  ORDER BY id
  FOR UPDATE;

  FOR v_row IN
    SELECT * FROM jsonb_to_recordset(p_rows)
      AS x(menu_id uuid, quantity integer, amount integer, sold_at timestamptz, external_id text)
  LOOP
    SELECT * INTO v_menu FROM public.menus WHERE id = v_row.menu_id;
    -- 음수 = 취소·반품
    IF v_row.quantity IS NULL OR v_row.quantity = 0 OR abs(v_row.quantity) > 10000 THEN
      RAISE EXCEPTION '판매 수량을 확인해 주세요: %', v_menu.name;
    END IF;
    -- 금액 부호는 수량과 같아야 한다 (취소 줄의 금액은 0 이하)
    IF v_row.amount IS NOT NULL AND (v_row.amount * sign(v_row.quantity) < 0) THEN
      RAISE EXCEPTION '판매 금액을 확인해 주세요: %', v_menu.name;
    END IF;
    IF v_row.sold_at IS NULL OR v_row.sold_at > now() + interval '10 minutes' THEN
      RAISE EXCEPTION '판매 시각을 확인해 주세요. 미래 시각은 기록할 수 없습니다.';
    END IF;
    IF v_row.external_id IS NULL OR length(v_row.external_id) NOT BETWEEN 1 AND 300 THEN
      RAISE EXCEPTION '판매 행 키가 올바르지 않습니다.';
    END IF;
    v_amount := coalesce(v_row.amount, v_menu.price * v_row.quantity);

    -- 판매 화면에서 하나씩 취소한 판매는 다시 가져오지 않는다. (cancelled_sale_keys, ..._sale_cancel_keys.sql)
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.cancelled_sale_keys k
      WHERE k.store_id = v_store_id AND k.source = 'csv' AND k.external_id = v_row.external_id
    );

    v_sale_id := NULL;
    INSERT INTO public.sale_records
      (store_id, menu_id, quantity, amount, sold_at, source, external_id, import_id, created_by)
    VALUES
      (v_store_id, v_menu.id, v_row.quantity, v_amount, v_row.sold_at, 'csv', v_row.external_id, p_import_id, v_uid)
    ON CONFLICT (store_id, source, external_id) WHERE external_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_sale_id;
    CONTINUE WHEN v_sale_id IS NULL;

    FOR v_ingredient IN
      SELECT ri.item_id, ri.quantity FROM public.recipe_ingredients ri WHERE ri.menu_id = v_menu.id ORDER BY ri.item_id
    LOOP
      IF v_row.quantity > 0 THEN
        -- 판매: 레시피대로 재료 차감 (packages/core 의 saleDeductions 와 같은 계산)
        PERFORM public.stock_outflow(
          v_ingredient.item_id, 'sale', round(v_ingredient.quantity * v_row.quantity, 3), NULL, 1,
          format('판매(CSV): %s %s개', v_menu.name, v_row.quantity), v_uid, v_row.sold_at, v_sale_id
        );
      ELSE
        -- 취소·반품: 재료를 되돌린다 (로트 없이)
        INSERT INTO public.stock_movements
          (store_id, item_id, type, quantity, memo, sale_record_id, occurred_at, created_by)
        VALUES
          (v_store_id, v_ingredient.item_id, 'sale', round(v_ingredient.quantity * -v_row.quantity, 3),
           format('판매 취소(CSV): %s %s개', v_menu.name, -v_row.quantity), v_sale_id, v_row.sold_at, v_uid);
      END IF;
    END LOOP;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
