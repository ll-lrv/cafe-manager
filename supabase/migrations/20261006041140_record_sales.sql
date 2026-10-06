-- 판매 기록 함수. 판매 기록과 레시피대로의 재료 차감을 한 트랜잭션으로 처리한다.
-- 유통기한 순 차감은 입출고 함수와 같은 내부 함수(stock_outflow)를 쓴다.
-- NestJS로 옮길 때의 대응표: docs/db-functions.md

------------------------------------------------------------
-- 1. stock_outflow (내부 전용)
--   품목에서 p_quantity(기본 단위, 양수)를 꺼내 원장에 음수로 기록한다.
--   유통기한 품목이면 기한이 빠른 로트부터(기한 없음은 맨 뒤, 같으면 먼저 입고된 순), 모자라면 로트 없이.
--   (packages/core 의 allocateFifo 와 같은 규칙)
--   호출하는 쪽에서 권한 확인과 품목 잠금(FOR UPDATE)을 먼저 해야 한다. 클라이언트는 직접 부를 수 없다.
--   반환: 기록된 원장 행 수
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stock_outflow(
  p_item_id uuid,
  p_type public.movement_type,
  p_quantity numeric,
  p_unit_id uuid,
  p_factor numeric,
  p_memo text,
  p_created_by uuid,
  p_occurred_at timestamptz,
  p_sale_record_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.items%ROWTYPE;
  v_lot record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_rows integer := 0;
BEGIN
  SELECT * INTO v_item FROM public.items WHERE id = p_item_id;
  IF p_quantity <= 0 THEN
    RETURN 0;
  END IF;

  IF v_item.track_expiry THEN
    FOR v_lot IN
      SELECT l.id, sum(m.quantity) AS quantity
      FROM public.stock_lots l
      JOIN public.stock_movements m ON m.lot_id = l.id
      WHERE l.item_id = v_item.id
      GROUP BY l.id
      HAVING sum(m.quantity) > 0
      ORDER BY l.expires_on ASC NULLS LAST, l.received_at, l.id
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := least(v_lot.quantity, v_remaining);
      INSERT INTO public.stock_movements
        (store_id, item_id, lot_id, type, quantity, entered_unit_id, entered_quantity, memo,
         sale_record_id, occurred_at, created_by)
      VALUES
        (v_item.store_id, v_item.id, v_lot.id, p_type, -v_take, p_unit_id, round(-v_take / p_factor, 3), p_memo,
         p_sale_record_id, p_occurred_at, p_created_by);
      v_remaining := v_remaining - v_take;
      v_rows := v_rows + 1;
    END LOOP;
  END IF;

  -- 로트가 없거나 모자란 만큼은 로트 없이 차감한다. (재고가 마이너스가 될 수 있다: 기록이 늦은 경우)
  IF v_remaining > 0 THEN
    INSERT INTO public.stock_movements
      (store_id, item_id, type, quantity, entered_unit_id, entered_quantity, memo,
       sale_record_id, occurred_at, created_by)
    VALUES
      (v_item.store_id, v_item.id, p_type, -v_remaining, p_unit_id, round(-v_remaining / p_factor, 3), p_memo,
       p_sale_record_id, p_occurred_at, p_created_by);
    v_rows := v_rows + 1;
  END IF;

  RETURN v_rows;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.stock_outflow(uuid, public.movement_type, numeric, uuid, numeric, text, uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 2. record_stock_movement: 나가는 기록을 stock_outflow 로 바꾼다. (동작은 그대로)
------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_stock_movement(
  p_item_id uuid,
  p_type public.movement_type,
  p_quantity numeric,
  p_unit_id uuid DEFAULT NULL,
  p_unit_price integer DEFAULT NULL,
  p_expires_on date DEFAULT NULL,
  p_memo text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.items%ROWTYPE;
  v_factor numeric := 1;
  v_base numeric;
  v_unit_cost numeric;
  v_lot_id uuid;
  v_memo text := nullif(btrim(p_memo), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  -- 같은 품목의 기록을 차례로 처리한다. (동시에 기록해도 로트 잔량 계산이 겹치지 않도록)
  SELECT * INTO v_item FROM public.items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_member(v_item.store_id) THEN
    RAISE EXCEPTION '품목을 찾을 수 없습니다.';
  END IF;
  IF v_item.archived_at IS NOT NULL THEN
    RAISE EXCEPTION '보관된 품목입니다. 다시 사용으로 바꾼 뒤 기록해 주세요.';
  END IF;

  -- 권한과 입력값 확인 (권한 표: packages/core/src/permissions.ts 의 stock:move, stock:adjust)
  IF p_type = 'sale' THEN
    RAISE EXCEPTION '판매 차감은 판매 입력에서 기록합니다.';
  END IF;
  IF p_type = 'adjust' AND NOT public.is_store_admin(v_item.store_id) THEN
    RAISE EXCEPTION '재고 조정은 사장과 매니저만 할 수 있습니다.';
  END IF;
  IF p_quantity IS NULL
    OR (p_type = 'adjust' AND p_quantity = 0)
    OR (p_type <> 'adjust' AND p_quantity <= 0) THEN
    RAISE EXCEPTION '수량을 확인해 주세요.';
  END IF;
  IF p_unit_price IS NOT NULL AND (p_type <> 'receive' OR p_unit_price < 0) THEN
    RAISE EXCEPTION '단가를 확인해 주세요.';
  END IF;
  IF p_type = 'receive' AND v_item.track_expiry AND p_expires_on IS NULL THEN
    RAISE EXCEPTION '유통기한을 입력해 주세요.';
  END IF;
  IF length(v_memo) > 500 THEN
    RAISE EXCEPTION '메모는 500자 이하로 입력해 주세요.';
  END IF;

  -- 입력 단위 → 기본 단위
  IF p_unit_id IS NOT NULL THEN
    SELECT factor INTO v_factor FROM public.item_units WHERE id = p_unit_id AND item_id = v_item.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '단위를 찾을 수 없습니다.';
    END IF;
  END IF;
  v_base := round(p_quantity * v_factor, 3);
  IF v_base = 0 THEN
    RAISE EXCEPTION '수량이 너무 작습니다.';
  END IF;
  IF p_type IN ('consume', 'waste') THEN
    v_base := -v_base;
  END IF;
  IF p_unit_price IS NOT NULL THEN
    v_unit_cost := round(p_unit_price::numeric / v_factor, 4);
  END IF;

  -- 들어오는 기록: 유통기한 품목이면 로트를 만든다.
  IF v_base > 0 THEN
    IF v_item.track_expiry THEN
      INSERT INTO public.stock_lots (store_id, item_id, expires_on)
      VALUES (v_item.store_id, v_item.id, p_expires_on)
      RETURNING id INTO v_lot_id;
    END IF;
    INSERT INTO public.stock_movements
      (store_id, item_id, lot_id, type, quantity, entered_unit_id, entered_quantity, unit_cost, memo, created_by)
    VALUES
      (v_item.store_id, v_item.id, v_lot_id, p_type, v_base, p_unit_id, round(v_base / v_factor, 3), v_unit_cost, v_memo, v_uid);
    RETURN 1;
  END IF;

  -- 나가는 기록
  RETURN public.stock_outflow(v_item.id, p_type, -v_base, p_unit_id, v_factor, v_memo, v_uid, now());
END;
$$;
--> statement-breakpoint

------------------------------------------------------------
-- 3. record_sales
--   여러 메뉴의 판매를 한 번에 기록한다. (하루 마감 입력, 나중에 POS/CSV 묶음 입력)
--   p_lines: [{"menu_id": uuid, "quantity": 정수, "amount": 정수|null}]  amount 가 없으면 가격 × 수량
--   p_sold_at: 판매 시각. 차감 원장의 occurred_at 도 이 시각으로 남긴다.
--   메뉴마다 sale_records 1행 + 레시피 재료마다 sale 원장(유통기한 순, stock_outflow)
--   반환: 기록한 판매 건수
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

  -- 차감할 재료 품목을 id 순으로 잠근다. (입출고·다른 판매와 동시에 기록해도 로트 계산이 겹치지 않고, 교착도 피한다)
  PERFORM 1 FROM public.items
  WHERE id IN (
    SELECT ri.item_id FROM public.recipe_ingredients ri
    WHERE ri.menu_id IN (SELECT x.menu_id FROM jsonb_to_recordset(p_lines) AS x(menu_id uuid))
  )
  ORDER BY id
  FOR UPDATE;

  FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(menu_id uuid, quantity integer, amount integer)
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

    INSERT INTO public.sale_records (store_id, menu_id, quantity, amount, sold_at, source, created_by)
    VALUES (v_store_id, v_menu.id, v_line.quantity, coalesce(v_line.amount, v_menu.price * v_line.quantity),
            p_sold_at, 'manual', v_uid)
    RETURNING id INTO v_sale_id;

    -- 레시피대로 재료 차감 (packages/core 의 saleDeductions 와 같은 계산: 사용량 × 판매 수량)
    FOR v_ingredient IN
      SELECT ri.item_id, ri.quantity FROM public.recipe_ingredients ri WHERE ri.menu_id = v_menu.id ORDER BY ri.item_id
    LOOP
      PERFORM public.stock_outflow(
        v_ingredient.item_id, 'sale', round(v_ingredient.quantity * v_line.quantity, 3), NULL, 1,
        format('판매: %s %s개', v_menu.name, v_line.quantity), v_uid, p_sold_at, v_sale_id
      );
    END LOOP;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION public.record_sales(jsonb, timestamptz) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_sales(jsonb, timestamptz) TO authenticated;--> statement-breakpoint

------------------------------------------------------------
-- 4. 판매 기록도 함수로만 쓴다. (직접 INSERT 하면 재료 차감을 건너뛸 수 있다)
--   판매 취소는 그대로 sale_records 삭제(사장·매니저, sale_records_delete 정책).
--   삭제하면 연결된 sale 원장도 함께 지워진다(FK cascade). 원장 삭제 금지 규칙의 유일한 예외다.
------------------------------------------------------------
DROP POLICY sale_records_insert ON public.sale_records;--> statement-breakpoint

-- 판매 입력을 다른 기기 화면에 바로 반영
ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_records;
