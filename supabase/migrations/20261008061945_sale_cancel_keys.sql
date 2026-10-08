-- 가져온 판매를 하나씩 취소할 때
--   1) 취소한 행 키를 cancelled_sale_keys 에 남겨, 기간이 겹치는 파일을 다시 올려도 되살아나지 않게 한다.
--   2) 다른 기기에 판매 취소를 방송한다. (앞 마이그레이션은 가져온 판매를 모두 방송에서 뺐다)
-- 가져오기 전체 취소(sale_imports 삭제 → cascade)는 둘 다 하지 않는다: 같은 파일을 다시 올릴 수 있어야 하고,
-- 방송은 sale_imports 트리거가 한 번만 보낸다.
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- 1. 표: 트리거와 함수만 쓴다 (정책 없음 → 클라이언트는 읽기·쓰기 불가)
------------------------------------------------------------
ALTER TABLE public.cancelled_sale_keys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

------------------------------------------------------------
-- 2. 판매가 지워질 때
--   가져온 판매인데 그 가져오기 기록이 이미 없으면 = 가져오기 전체 취소의 cascade → 아무것도 안 한다.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broadcast_sale_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF old.import_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.sale_imports WHERE id = old.import_id) THEN
    RETURN old;
  END IF;

  IF old.external_id IS NOT NULL THEN
    INSERT INTO public.cancelled_sale_keys (store_id, source, external_id)
    VALUES (old.store_id, old.source, old.external_id)
    ON CONFLICT DO NOTHING;
  END IF;

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

DROP TRIGGER sale_records_broadcast_cancel ON public.sale_records;--> statement-breakpoint
CREATE TRIGGER sale_records_broadcast_cancel AFTER DELETE ON public.sale_records
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_sale_cancelled();--> statement-breakpoint

------------------------------------------------------------
-- 3. import_sales: 하나씩 취소한 행 키는 건너뛴다 (나머지는 앞 마이그레이션과 같음)
------------------------------------------------------------
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
    IF v_row.quantity IS NULL OR v_row.quantity <= 0 OR v_row.quantity > 10000 THEN
      RAISE EXCEPTION '판매 수량을 확인해 주세요: %', v_menu.name;
    END IF;
    IF v_row.amount IS NOT NULL AND v_row.amount < 0 THEN
      RAISE EXCEPTION '판매 금액을 확인해 주세요: %', v_menu.name;
    END IF;
    IF v_row.sold_at IS NULL OR v_row.sold_at > now() + interval '10 minutes' THEN
      RAISE EXCEPTION '판매 시각을 확인해 주세요. 미래 시각은 기록할 수 없습니다.';
    END IF;
    IF v_row.external_id IS NULL OR length(v_row.external_id) NOT BETWEEN 1 AND 300 THEN
      RAISE EXCEPTION '판매 행 키가 올바르지 않습니다.';
    END IF;

    -- 판매 화면에서 하나씩 취소한 판매는 다시 가져오지 않는다.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.cancelled_sale_keys k
      WHERE k.store_id = v_store_id AND k.source = 'csv' AND k.external_id = v_row.external_id
    );

    v_sale_id := NULL;
    INSERT INTO public.sale_records
      (store_id, menu_id, quantity, amount, sold_at, source, external_id, import_id, created_by)
    VALUES
      (v_store_id, v_menu.id, v_row.quantity, coalesce(v_row.amount, v_menu.price * v_row.quantity),
       v_row.sold_at, 'csv', v_row.external_id, p_import_id, v_uid)
    ON CONFLICT (store_id, source, external_id) WHERE external_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_sale_id;
    CONTINUE WHEN v_sale_id IS NULL;

    -- 레시피대로 재료 차감 (packages/core 의 saleDeductions 와 같은 계산)
    FOR v_ingredient IN
      SELECT ri.item_id, ri.quantity FROM public.recipe_ingredients ri WHERE ri.menu_id = v_menu.id ORDER BY ri.item_id
    LOOP
      PERFORM public.stock_outflow(
        v_ingredient.item_id, 'sale', round(v_ingredient.quantity * v_row.quantity, 3), NULL, 1,
        format('판매(CSV): %s %s개', v_menu.name, v_row.quantity), v_uid, v_row.sold_at, v_sale_id
      );
    END LOOP;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
