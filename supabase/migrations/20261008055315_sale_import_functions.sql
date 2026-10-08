-- CSV 판매 가져오기: 가져오기 기록(sale_imports), 메뉴 이름 매칭(menu_aliases), 가져오기 함수(import_sales)
-- 권한 표: packages/core/src/permissions.ts 의 sale:import (사장·매니저)
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- 1. RLS
------------------------------------------------------------
ALTER TABLE public.sale_imports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.menu_aliases ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- 가져오기는 만들고·보고·취소(삭제)만 한다. 취소하면 그때 들어온 판매와 재료 차감이 cascade 로 지워진다.
CREATE POLICY sale_imports_select ON public.sale_imports FOR SELECT TO authenticated
  USING (public.is_store_admin(store_id));--> statement-breakpoint
CREATE POLICY sale_imports_insert ON public.sale_imports FOR INSERT TO authenticated
  WITH CHECK (public.is_store_admin(store_id) AND created_by = auth.uid());--> statement-breakpoint
CREATE POLICY sale_imports_delete ON public.sale_imports FOR DELETE TO authenticated
  USING (public.is_store_admin(store_id));--> statement-breakpoint

-- 매칭은 같은 매장 메뉴로만 (menu_id 가 null 이면 "가져오지 않음")
CREATE POLICY menu_aliases_select ON public.menu_aliases FOR SELECT TO authenticated
  USING (public.is_store_admin(store_id));--> statement-breakpoint
CREATE POLICY menu_aliases_write ON public.menu_aliases FOR ALL TO authenticated
  USING (public.is_store_admin(store_id))
  WITH CHECK (
    public.is_store_admin(store_id)
    AND (menu_id IS NULL OR EXISTS (SELECT 1 FROM public.menus m WHERE m.id = menu_id AND m.store_id = menu_aliases.store_id))
  );--> statement-breakpoint

ALTER TABLE public.menu_aliases ADD CONSTRAINT menu_aliases_source_name_check
  CHECK (length(source_name) BETWEEN 1 AND 200);--> statement-breakpoint
ALTER TABLE public.sale_imports ADD CONSTRAINT sale_imports_file_name_check
  CHECK (length(file_name) BETWEEN 1 AND 200);--> statement-breakpoint

------------------------------------------------------------
-- 2. import_sales
--   가져오기(p_import_id) 하나에 판매 행을 넣는다. 파일이 크면 화면에서 나눠 여러 번 부른다.
--   p_rows: [{"menu_id": uuid, "quantity": 정수, "amount": 정수|null, "sold_at": 시각, "external_id": 문자열}]
--   amount 가 없으면 메뉴 가격 × 수량. external_id 는 파일 내용으로 만든 행 키로,
--   같은 행이 이미 들어와 있으면(같은 파일을 다시 올림, 기간이 겹치는 파일) 건너뛴다. (sale_records_external_key)
--   판매마다 레시피대로 재료를 차감한다 (record_sales 와 같음, 원장 시각 = 판매 시각).
--   보관된 메뉴도 받는다 (지난 판매 기록이므로).
--   반환: 새로 넣은 판매 건수
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
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.import_sales(uuid, jsonb) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.import_sales(uuid, jsonb) TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 3. 가져오기 취소 방송
--   가져오기를 지우면 판매 수백 건이 cascade 로 지워진다. 판매마다 방송하지 않고 가져오기 하나에 한 번만 보낸다.
------------------------------------------------------------
DROP TRIGGER sale_records_broadcast_cancel ON public.sale_records;--> statement-breakpoint
CREATE TRIGGER sale_records_broadcast_cancel AFTER DELETE ON public.sale_records
  FOR EACH ROW WHEN (old.import_id IS NULL) EXECUTE FUNCTION public.broadcast_sale_cancelled();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.broadcast_sale_import_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object('import_id', old.id),
    'sale_cancelled',
    'store:' || old.store_id::text,
    true
  );
  RETURN old;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.broadcast_sale_import_cancelled() FROM PUBLIC, anon, authenticated;--> statement-breakpoint

CREATE TRIGGER sale_imports_broadcast_cancel AFTER DELETE ON public.sale_imports
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_sale_import_cancelled();
